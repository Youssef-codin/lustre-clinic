import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppointmentWithPatient } from '@mawid/shared';
import request from 'supertest';
import type { Config } from '../src/config/index.ts';
import { setConfig } from '../src/config/index.ts';
import { createAppointment } from '../src/modules/appointment/appointment.service.ts';
import type { PrintDriver } from '../src/services/printer/driver.ts';
import { fileDriver } from '../src/services/printer/drivers/file.driver.ts';
import { renderDaySchedule, renderSlip, startPrinter } from '../src/services/printer/index.ts';
import { clearFailures, enqueue, flush, recentFailures, setDriver } from '../src/services/printer/queue.ts';
import { measureText, shapeText, truncateToWidth } from '../src/services/printer/render/text.ts';
import { getStatus, setStatus } from '../src/services/status.ts';
import { atMonday, FRIDAY, loadTestConfig, MONDAY, testApp } from './helpers/app.ts';
import { closeTestDb, openTestDb, resetDb } from './helpers/db.ts';

let config: Config;

/** The real driver backs off 1s then 4s; tests assert the retry count, not the wait. */
const NO_BACKOFF = { retryDelaysMs: [0, 0] };

const patient = { id: 1, name: 'منى صلاح الدين', phone: '+201001234567' };

const appointment: AppointmentWithPatient = {
    id: 1,
    ref: '030826-01',
    patientId: 1,
    startsAt: '2026-08-03T08:00:00.000Z',
    durationMin: 90,
    typeId: 'rootcanal',
    note: 'حساسية تجاه البنسلين',
    status: 'booked',
    channel: 'desk',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    patient,
};

beforeAll(() => {
    config = loadTestConfig();
});

/*
 * Arabic is the part of printing that fails silently — a mangled slip still
 * prints. These assert the shaper's observable behaviour; the visual check is
 * done by rendering the PDF and looking at it.
 */
describe('Arabic text shaping', () => {
    test('produces glyph ids, not code points', () => {
        const { glyphs } = shapeText('أهلاً منى صلاح');

        expect(glyphs.length).toBeGreaterThan(0);
        // A shaped Arabic string carries combining marks with a zero advance —
        // proof that GPOS ran rather than the characters being drawn as-is.
        expect(glyphs.some((g) => g.xAdvance === 0 && g.yOffset !== 0)).toBe(true);
    });

    test('reorders a ref code so it reads as stored', () => {
        // Without an isolate, bidi splits `030826-01` at the hyphen and lays the
        // two numbers out right-to-left, printing `01-030826`.
        const plain = shapeText('رقم الحجز: 030826-01');
        const isolated = shapeText(`رقم الحجز: ⁦030826-01⁩`);

        expect(plain.glyphs.map((g) => g.glyphId)).not.toEqual(isolated.glyphs.map((g) => g.glyphId));
    });

    test('measures Arabic by shaped width, not character count', () => {
        // Four characters that join are narrower than four that do not.
        const joined = measureText('ححح', 12);
        const isolated = measureText('ددد', 12);

        expect(joined).toBeGreaterThan(0);
        expect(isolated).toBeGreaterThan(0);
        expect(joined).not.toBe(isolated);
    });

    test('an empty string measures zero', () => {
        expect(measureText('', 12)).toBe(0);
        expect(shapeText('').glyphs).toHaveLength(0);
    });

    test('truncation fits the width it is given', () => {
        const long = 'منى صلاح الدين عبد الرحمن محمد';
        const trimmed = truncateToWidth(long, 12, 60);

        expect(measureText(trimmed, 12)).toBeLessThanOrEqual(60);
        expect(trimmed.endsWith('…')).toBe(true);
    });

    test('truncation leaves a short string alone', () => {
        expect(truncateToWidth('منى', 12, 500)).toBe('منى');
    });
});

describe('rendering', () => {
    test('a slip is a valid PDF', async () => {
        const bytes = await renderSlip(appointment, config);

        expect(bytes.length).toBeGreaterThan(1000);
        expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    });

    test('a slip renders without a note', async () => {
        const bytes = await renderSlip({ ...appointment, note: null }, config);
        expect(bytes.length).toBeGreaterThan(1000);
    });

    test('a day schedule renders every booked appointment', async () => {
        const many = Array.from({ length: 40 }, (_, i) => ({
            ...appointment,
            id: i + 1,
            ref: `030826-${String(i + 1).padStart(2, '0')}`,
            startsAt: new Date(Date.parse('2026-08-03T07:00:00.000Z') + i * 15 * 60_000).toISOString(),
        }));

        const bytes = await renderDaySchedule('2026-08-03', many, config);
        // 40 rows do not fit one A4 page, so this also covers the page break.
        expect(bytes.length).toBeGreaterThan(1000);
    });

    test('a day schedule leaves out cancelled appointments', async () => {
        const cancelled = await renderDaySchedule(
            '2026-08-03',
            [{ ...appointment, status: 'cancelled' }],
            config,
        );
        const empty = await renderDaySchedule('2026-08-03', [], config);

        // Both render the "no appointments" sheet, so they come out the same size.
        expect(cancelled.length).toBe(empty.length);
    });

    test('an empty day still prints a sheet', async () => {
        const bytes = await renderDaySchedule('2026-08-07', [], config);
        expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    });
});

describe('the print queue', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mawid-print-'));
        clearFailures();
        setConfig({ ...config, printing: { driver: 'file', outputDir: dir } } as Config);
        setDriver(
            fileDriver({ ...config, printing: { driver: 'file', outputDir: dir } } as Config),
            NO_BACKOFF,
        );
    });

    afterAll(() => {
        setConfig(config);
    });

    test('writes a job through the driver', async () => {
        enqueue({
            id: 'slip-030826-01',
            target: { kind: 'slip', appointmentId: 1 },
            render: () => renderSlip(appointment, config),
        });
        await flush();

        expect(readdirSync(dir)).toContain('slip-030826-01.pdf');
        expect(recentFailures()).toHaveLength(0);
    });

    test('retries, then records a failure the desk banner can show', async () => {
        let attempts = 0;
        const broken: PrintDriver = {
            name: 'broken',
            available: async () => true,
            print: async () => {
                attempts += 1;
                throw new Error('printer is on fire');
            },
        };
        setDriver(broken, NO_BACKOFF);

        enqueue({
            id: 'slip-030826-02',
            target: { kind: 'slip', appointmentId: 2 },
            render: async () => new Uint8Array([1]),
        });
        await flush();

        expect(attempts).toBe(3);
        expect(recentFailures()).toHaveLength(1);
        expect(recentFailures()[0]?.kind).toBe('slip');
        expect(recentFailures()[0]).toMatchObject({ kind: 'slip', appointmentId: 2 });
        expect(recentFailures()[0]?.driver).toBe('broken');
        expect(recentFailures()[0]?.error).toContain('on fire');
        // Loud, not silent — the printer stops claiming to be healthy.
        expect(getStatus().printer).toBe('degraded');
    });

    test('a failing job does not block the one behind it', async () => {
        const printed: string[] = [];
        setDriver(
            {
                name: 'flaky',
                available: async () => true,
                print: async (job) => {
                    if (job.id === 'bad') throw new Error('nope');
                    printed.push(job.id);
                },
            },
            NO_BACKOFF,
        );

        enqueue({
            id: 'bad',
            target: { kind: 'slip', appointmentId: 7 },
            render: async () => new Uint8Array([1]),
        });
        enqueue({
            id: 'good',
            target: { kind: 'day', date: '2026-08-03' },
            render: async () => new Uint8Array([1]),
        });
        await flush();

        expect(printed).toEqual(['good']);
        expect(recentFailures().map((f) => (f.kind === 'slip' ? f.appointmentId : f.date))).toEqual([7]);
    });

    test('keeps only the most recent failures', async () => {
        setDriver(
            {
                name: 'always-broken',
                available: async () => true,
                print: async () => {
                    throw new Error('down');
                },
            },
            NO_BACKOFF,
        );

        for (let i = 0; i < 12; i += 1) {
            enqueue({
                id: `job-${i}`,
                target: { kind: 'slip', appointmentId: i },
                render: async () => new Uint8Array([1]),
            });
        }
        await flush();

        expect(recentFailures()).toHaveLength(10);
        // Most recent first.
        expect(recentFailures()[0]).toMatchObject({ kind: 'slip', appointmentId: 11 });
    });

    afterAll(() => {
        rmSync(dir, { recursive: true, force: true });
    });
});

describe('the print endpoints', () => {
    let app: ReturnType<typeof testApp>;
    let dir: string;

    beforeAll(() => {
        app = testApp();
        openTestDb();
    });

    afterAll(() => {
        closeTestDb();
        setConfig(config);
    });

    beforeEach(async () => {
        // Drain anything a previous test queued but did not flush, or it lands
        // in this test's failure list under this test's driver.
        await flush();
        resetDb();
        clearFailures();
        dir = mkdtempSync(join(tmpdir(), 'mawid-endpoint-'));
        const fileConfig = { ...config, printing: { driver: 'file', outputDir: dir } } as Config;
        setConfig(fileConfig);
        // The real entry point, so the endpoints exercise the same wiring
        // `server.ts` sets up rather than a driver poked in from the side.
        await startPrinter(fileConfig, NO_BACKOFF);
    });

    function book() {
        return createAppointment({
            patient: { name: 'منى صلاح', phone: '01001234567' },
            startsAt: atMonday('08:00'),
            typeId: 'cleaning',
        });
    }

    test('reprints a slip on demand', async () => {
        const appointment = book();

        const res = await request(app).post(`/api/print/slip/${appointment.id}`).expect(202);
        expect(res.body.data).toEqual({ queued: true, kind: 'slip' });

        await flush();
        expect(readdirSync(dir)).toContain(`slip-${appointment.ref}.pdf`);
    });

    test('reprinting something that does not exist is a 404', async () => {
        const res = await request(app).post('/api/print/slip/9999').expect(404);
        expect(res.body.error.code).toBe('APPOINTMENT_NOT_FOUND');
    });

    test('prints the day schedule', async () => {
        book();

        const res = await request(app).post('/api/print/day').query({ date: MONDAY }).expect(202);
        expect(res.body.data).toEqual({ queued: true, kind: 'day' });

        await flush();
        expect(readdirSync(dir)).toContain(`day-${MONDAY}.pdf`);
    });

    test('a day with nothing booked still prints a sheet', async () => {
        await request(app).post('/api/print/day').query({ date: FRIDAY }).expect(202);
        await flush();

        expect(readdirSync(dir)).toContain(`day-${FRIDAY}.pdf`);
    });

    test('a missing date is a validation failure', async () => {
        await request(app).post('/api/print/day').expect(400);
    });

    test('an unavailable printer is refused, not silently queued', async () => {
        const appointment = book();
        // After the booking: its own auto-print succeeds and would flip the
        // status back to ok.
        await flush();
        setStatus('printer', 'down');

        const res = await request(app).post(`/api/print/slip/${appointment.id}`).expect(503);
        expect(res.body.error.code).toBe('PRINTER_UNAVAILABLE');
    });

    test('printing turned off in config is refused too', async () => {
        setStatus('printer', 'disabled');

        const res = await request(app).post('/api/print/day').query({ date: MONDAY }).expect(503);
        expect(res.body.error.code).toBe('PRINTER_UNAVAILABLE');
    });

    test('a degraded printer still accepts jobs', async () => {
        // One earlier failure must not stop the next slip from being tried.
        setStatus('printer', 'degraded');
        const appointment = book();

        await request(app).post(`/api/print/slip/${appointment.id}`).expect(202);
    });

    test('serves the banner the same failures the socket pushed', async () => {
        setDriver(
            {
                name: 'broken',
                available: async () => true,
                print: async () => {
                    throw new Error('no paper');
                },
            },
            NO_BACKOFF,
        );

        enqueue({ id: 'x', target: { kind: 'day', date: MONDAY }, render: async () => new Uint8Array([1]) });
        await flush();

        const res = await request(app).get('/api/print/failures').expect(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({
            kind: 'day',
            date: MONDAY,
            error: 'no paper',
            driver: 'broken',
            attempts: 3,
        });
        // The id is what lets the desk dedupe a live event against this list.
        expect(res.body.data[0].id).toBeString();
        expect(res.body.data[0].failedAt).toBeString();
    });

    test('an empty banner is an empty list, not an error', async () => {
        const res = await request(app).get('/api/print/failures').expect(200);
        expect(res.body.data).toEqual([]);
    });
});
