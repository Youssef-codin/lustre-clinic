import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { RemindersResponse } from '@mawid/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { Config } from '../src/config/index.ts';
import { setConfig } from '../src/config/index.ts';
import { getDb, schema } from '../src/db/index.ts';
import { createAppointment, updateAppointment } from '../src/modules/appointment/appointment.service.ts';
import { decide, sweep } from '../src/services/reminders/index.ts';
import { reminderTimeFor, snapBackToOpen, withinSendWindow } from '../src/services/reminders/schedule.ts';
import { renderReminder } from '../src/services/reminders/template.ts';
import { setSender } from '../src/services/whatsapp/index.ts';
import { toClinicClock } from '../src/util/time.ts';
import { atMonday, loadTestConfig, MONDAY, testApp } from './helpers/app.ts';
import { closeTestDb, openTestDb, resetDb } from './helpers/db.ts';

/*
 * `config.example.json`, Africa/Cairo (UTC+3 in August):
 *   Mon 10:00–14:00 and 17:00–21:00   → 07:00–11:00Z, 14:00–18:00Z
 *   Fri closed
 *   sendWindow 10:00–20:00            → 07:00–17:00Z
 *   hoursBefore 18 · minLeadHours 3
 *
 * So the sendable windows on a Monday are 07:00–11:00Z and 14:00–17:00Z: the
 * intersection of open hours with the send window, which is what a reminder
 * has to satisfy.
 */
let config: Config;
let app: ReturnType<typeof testApp>;

const cairo = (iso: string) => toClinicClock(iso, 'Africa/Cairo');

beforeAll(() => {
    config = loadTestConfig();
    app = testApp();
    openTestDb();
});

afterAll(() => {
    closeTestDb();
    setConfig(config);
});

beforeEach(() => {
    resetDb();
    setConfig(config);
});

describe('the send window is the intersection of open hours and sendWindow', () => {
    test('a time already inside a window is left alone', () => {
        const inside = new Date(atMonday('08:00'));
        expect(snapBackToOpen(inside, config).toISOString()).toBe(atMonday('08:00'));
    });

    test('the afternoon gap snaps back to the end of the morning window', () => {
        // 12:00Z is 15:00 Cairo — clinic shut between 14:00 and 17:00 local.
        const snapped = snapBackToOpen(new Date(atMonday('12:00')), config);
        expect(cairo(snapped.toISOString()).time).toBe('13:59');
    });

    test('after the send window closes it snaps back inside it', () => {
        // 17:30Z is 20:30 Cairo: clinic open until 21:00, but sendWindow ends 20:00.
        const snapped = snapBackToOpen(new Date(atMonday('17:30')), config);
        expect(cairo(snapped.toISOString()).time).toBe('19:59');
    });

    test('a closed day snaps back to the previous open day', () => {
        // Friday is closed; Thursday is open 10:00–14:00 local.
        const snapped = snapBackToOpen(new Date('2026-08-07T09:00:00.000Z'), config);
        const clock = cairo(snapped.toISOString());

        expect(clock.date).toBe('2026-08-06');
        expect(clock.time).toBe('13:59');
    });

    test('never snaps forwards', () => {
        // Before the clinic opens on Monday, so the answer is Sunday — never
        // later than the input. A reminder after its appointment is worse than
        // one that is early.
        const input = new Date(atMonday('05:00'));
        expect(snapBackToOpen(input, config).getTime()).toBeLessThan(input.getTime());
    });

    test('withinSendWindow tracks the configured window, not opening hours', () => {
        expect(withinSendWindow(new Date(atMonday('08:00')), config)).toBe(true);
        // 20:30 Cairo — clinic open, send window shut.
        expect(withinSendWindow(new Date(atMonday('17:30')), config)).toBe(false);
        // 09:00 Cairo — send window shut.
        expect(withinSendWindow(new Date(atMonday('06:00')), config)).toBe(false);
    });
});

describe('reminderTimeFor', () => {
    test('is hoursBefore earlier when that lands in an open window', () => {
        // Mon 20:00 Cairo minus 18h = Mon 02:00 Cairo → closed → snaps back to
        // Sunday, which is open 10:00–14:00.
        const scheduled = reminderTimeFor(atMonday('17:00'), config);
        const clock = cairo(scheduled);

        expect(clock.date).toBe('2026-08-02');
        expect(clock.time).toBe('13:59');
    });

    test('the case the snap exists for: a Monday morning appointment', () => {
        // 11:00 Cairo Monday minus 18h is Sunday 17:00 — the clinic shuts at
        // 14:00 on Sunday, so unsnapped this would sit until Monday and arrive
        // late. Snapped, it goes out Sunday afternoon while someone is there.
        const scheduled = reminderTimeFor(atMonday('08:00'), config);
        const clock = cairo(scheduled);

        expect(clock.date).toBe('2026-08-02');
        expect(Number(clock.time.slice(0, 2))).toBeLessThan(14);
    });

    test('is always at or before the appointment', () => {
        for (const at of ['07:00', '08:30', '10:00', '14:00', '16:00']) {
            expect(Date.parse(reminderTimeFor(atMonday(at), config))).toBeLessThan(Date.parse(atMonday(at)));
        }
    });
});

describe('a reminder row is created with the booking', () => {
    function book(startsAt = atMonday('08:00')) {
        return createAppointment({
            patient: { name: 'منى صلاح', phone: '01001234567' },
            startsAt,
            typeId: 'cleaning',
        });
    }

    function reminderFor(appointmentId: number) {
        return getDb()
            .select()
            .from(schema.reminders)
            .all()
            .find((r) => r.appointmentId === appointmentId);
    }

    test('booking creates exactly one pending reminder', () => {
        const appointment = book();
        const reminder = reminderFor(appointment.id);

        expect(reminder?.status).toBe('pending');
        expect(reminder?.attempts).toBe(0);
        expect(reminder?.skipReason).toBeNull();
        expect(reminder?.scheduledFor).toBe(reminderTimeFor(appointment.startsAt, config));
    });

    test('a patient is never messaged twice for the same appointment', () => {
        const appointment = book();

        // The UNIQUE constraint is the guarantee, not application logic (§5).
        expect(() =>
            getDb()
                .insert(schema.reminders)
                .values({ appointmentId: appointment.id, status: 'pending', scheduledFor: atMonday('06:00') })
                .run(),
        ).toThrow();
    });

    test('moving the appointment moves its reminder', () => {
        const appointment = book(atMonday('08:00'));
        const before = reminderFor(appointment.id)?.scheduledFor;

        // Tuesday 10:00 Cairo. Its reminder lands on Monday, not Sunday.
        const moved = '2026-08-04T07:00:00.000Z';
        updateAppointment(appointment.id, { startsAt: moved });
        const after = reminderFor(appointment.id)?.scheduledFor;

        expect(after).not.toBe(before);
        expect(after).toBe(reminderTimeFor(moved, config));
    });

    test('the snap concentrates reminders at the end of a window', () => {
        // Two appointments hours apart on Monday both snap to the close of
        // Sunday's sendable window, because that is the last open moment before
        // either. Real behaviour, and the reason the sweep throttles per tick
        // rather than sending everything that comes due at once.
        expect(reminderTimeFor(atMonday('08:00'), config)).toBe(reminderTimeFor(atMonday('16:00'), config));
    });

    test('reminders turned off means no row is created', () => {
        setConfig({ ...config, reminders: { ...config.reminders, enabled: false } } as Config);
        const appointment = book();

        expect(reminderFor(appointment.id)).toBeUndefined();
    });
});

describe('the message', () => {
    test('fills every placeholder from config and the appointment', () => {
        const text = renderReminder(config.reminders.template, 'منى صلاح', atMonday('08:00'), config);

        expect(text).toContain('منى صلاح');
        expect(text).toContain(config.clinic.name);
        expect(text).toContain(config.clinic.phone);
        expect(text).toContain('11:00');
        expect(text).not.toContain('{');
    });

    test('identifies the clinic and offers a way out', () => {
        const text = renderReminder(config.reminders.template, 'منى', atMonday('08:00'), config);

        // Required by §8: who it is from, and an opt-out.
        expect(text).toContain(config.clinic.name);
        expect(text).toContain('إيقاف');
    });

    test('an unknown placeholder is left visible rather than blanked', () => {
        // A typo in config should show up in the message, not send a sentence
        // with a silent hole in it.
        expect(renderReminder('{patient} {nope}', 'منى', atMonday('08:00'), config)).toBe('منى {nope}');
    });
});

describe('GET /api/reminders', () => {
    test('lists one row per appointment that day, with the patient', async () => {
        createAppointment({
            patient: { name: 'منى صلاح', phone: '01001234567' },
            startsAt: atMonday('08:00'),
            typeId: 'cleaning',
        });

        const res = await request(app).get('/api/reminders').query({ date: MONDAY }).expect(200);
        const body = res.body.data as RemindersResponse;

        expect(body).toHaveLength(1);
        expect(body[0]?.status).toBe('pending');
        // The secretary reads a name, a number and a time off this and phones.
        expect(body[0]?.patient.name).toBe('منى صلاح');
        expect(body[0]?.patient.phone).toBe('+201001234567');
        expect(body[0]?.appointmentStartsAt).toBe(atMonday('08:00'));
    });

    test('a day with nothing booked is an empty list', async () => {
        const res = await request(app).get('/api/reminders').query({ date: '2026-08-04' }).expect(200);
        expect(res.body.data).toEqual([]);
    });

    test('a missing date is a validation failure', async () => {
        await request(app).get('/api/reminders').expect(400);
    });
});

describe('skip rules, evaluated immediately before each send', () => {
    const row = (over: Partial<Parameters<typeof decide>[0]> = {}) => ({
        reminderId: 1,
        appointmentId: 1,
        attempts: 0,
        scheduledFor: atMonday('07:30'),
        startsAt: atMonday('12:00'),
        appointmentStatus: 'booked',
        patientName: 'منى',
        patientPhone: '+201001234567',
        ...over,
    });

    test('an appointment already under way is skipped', () => {
        // A reminder for a past appointment makes the system look broken.
        const now = new Date(atMonday('12:30'));
        expect(decide(row(), now, config)).toEqual({ action: 'skip', reason: 'started' });
    });

    test('closer than minLeadHours is skipped as too late', () => {
        // minLeadHours is 3; this is 2 hours out.
        const now = new Date(atMonday('10:00'));
        expect(decide(row(), now, config)).toEqual({ action: 'skip', reason: 'too_late' });
    });

    test('a cancelled appointment is skipped, and reads as cancelled', () => {
        // Even though it has also started — cancelled is the one reason the
        // secretary does not need to phone.
        const now = new Date(atMonday('12:30'));
        const decision = decide(row({ appointmentStatus: 'cancelled' }), now, config);

        expect(decision).toEqual({ action: 'skip', reason: 'cancelled' });
    });

    test('outside the send window it waits rather than skipping', () => {
        // 06:00Z is 09:00 Cairo, before the 10:00 send window. Nobody is
        // skipped for the clock; it is retried next tick.
        const now = new Date(atMonday('06:00'));
        expect(decide(row({ startsAt: atMonday('16:00') }), now, config)).toEqual({ action: 'wait' });
    });

    test('otherwise it sends — even if late', () => {
        // Four hours' notice still works.
        const now = new Date(atMonday('08:00'));
        expect(decide(row(), now, config)).toEqual({ action: 'send' });
    });
});

describe('the sweep', () => {
    /*
     * A fixed clock, because every rule here is time-dependent and the real one
     * would make these pass or fail depending on the hour the suite is run.
     *
     * NOW is Monday 11:00 Cairo — inside the send window. The appointments sit
     * in the evening window, eight hours out, comfortably past minLeadHours.
     */
    const NOW = new Date(atMonday('08:00'));
    const clock = () => NOW;
    const futureAppointment = (i = 0) => atMonday(`${16 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`);

    function setSenderForTest(over: { connected?: boolean; send: (to: string) => Promise<void> }) {
        setSender({
            name: 'test',
            send: over.send,
            status: () => ({ connected: over.connected ?? true, dryRun: false }),
            logout: async () => undefined,
            stop: async () => undefined,
        });
    }

    function bookAt(startsAt: string, phone: string) {
        return createAppointment({
            patient: { name: 'منى صلاح', phone },
            startsAt,
            typeId: 'cleaning',
        });
    }

    /** Makes a booking's reminder due now, as if the clock had reached it. */
    function makeDue(appointmentId: number, scheduledFor: string) {
        getDb()
            .update(schema.reminders)
            .set({ scheduledFor })
            .where(eq(schema.reminders.appointmentId, appointmentId))
            .run();
    }

    function statuses() {
        return getDb()
            .select()
            .from(schema.reminders)
            .all()
            .map((r) => ({
                status: r.status,
                skipReason: r.skipReason,
            }));
    }

    test('sends what is due and marks it sent', async () => {
        const sent: string[] = [];
        setSenderForTest({ send: async (to) => void sent.push(to) });

        const appointment = bookAt(futureAppointment(), '01001111111');
        makeDue(appointment.id, new Date(NOW.getTime() - 60_000).toISOString());

        await sweep(clock);

        expect(sent).toHaveLength(1);
        expect(statuses()[0]?.status).toBe('sent');
    });

    test('a send failure retries before it is called failed', async () => {
        setSenderForTest({
            send: async () => {
                throw new Error('socket closed');
            },
        });

        const appointment = bookAt(futureAppointment(), '01002222222');
        makeDue(appointment.id, new Date(NOW.getTime() - 60_000).toISOString());

        await sweep(clock);
        expect(statuses()[0]?.status).toBe('pending');

        await sweep(clock);
        await sweep(clock);
        expect(statuses()[0]?.status).toBe('failed');
    });

    test('a disconnected socket leaves everything pending', async () => {
        setSenderForTest({ connected: false, send: async () => undefined });

        const appointment = bookAt(futureAppointment(), '01003333333');
        makeDue(appointment.id, new Date(NOW.getTime() - 60_000).toISOString());

        await sweep(clock);

        // Nothing is skipped for a socket problem — that is not the patient's
        // fault and it may be back next tick.
        expect(statuses()[0]?.status).toBe('pending');
    });

    test('a catch-up drain is capped, and the rest are surfaced to be phoned', async () => {
        const sent: string[] = [];
        setSenderForTest({ send: async (to) => void sent.push(to) });

        // Three overdue by hours — the shape left behind after the PC was off.
        const cap = 2;
        setConfig({
            ...config,
            reminders: {
                ...config.reminders,
                catchUp: { minGapMinutes: 0, maxGapMinutes: 0, maxMessages: cap },
            },
        } as Config);

        const overdue = new Date(NOW.getTime() - 6 * 3_600_000).toISOString();
        for (const [i, phone] of ['01004444444', '01005555555', '01006666666'].entries()) {
            const appointment = bookAt(futureAppointment(i), phone);
            makeDue(appointment.id, overdue);
        }

        await sweep(clock);

        expect(sent).toHaveLength(cap);
        const skipped = statuses().filter((r) => r.status === 'skipped');
        expect(skipped).toHaveLength(1);
        expect(skipped[0]?.skipReason).toBe('catch_up_cap');
    });
});
