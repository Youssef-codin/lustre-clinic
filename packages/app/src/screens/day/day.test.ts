/**
 * There is no renderer under `bun test`, so what is tested here is the part of
 * the screen that is not React: which day is closed, where a block lands, and —
 * the one that matters — what the secretary is told when Postgres refuses a
 * double booking.
 */
import { describe, expect, it } from 'bun:test';
import { type AppointmentStatus, ERROR_CODE } from '@mawid/shared';
import { procedureLabel, splitDay } from './agenda';
import { slotProgress, splitDoctorDay } from './chair';
import { RequestError } from './data/client';
import type { Appointment } from './data/types';
import { describeError } from './errors';
import { hoursFor, isClosed, openMinutes } from './hours';
import { amountDue, formatMoney, poundsEntry } from './money';
import {
    addDays,
    clock12,
    clockToMinutes,
    dateKey,
    formatDatePill,
    minutesOfDay,
    minutesToClock,
    relativeDayLabel,
} from './time';

const FRIDAY = '2026-08-07';
const SATURDAY = '2026-08-08';

describe('clinic hours', () => {
    it('falls back to the defaults when the clinic has never set a schedule', () => {
        expect(hoursFor(SATURDAY, undefined)).toEqual({ opens: 600, closes: 1320 });
        expect(hoursFor(SATURDAY, [])).toEqual({ opens: 600, closes: 1320 });
    });

    it('closes the default rest day', () => {
        expect(isClosed(FRIDAY, undefined)).toBe(true);
        expect(openMinutes(FRIDAY, undefined)).toBe(0);
    });

    it('lets a saved schedule win, and a missing weekday means closed', () => {
        const schedule = [{ weekday: 5, branchId: 'b', opensAt: '09:00', closesAt: '13:00' }];

        expect(hoursFor(FRIDAY, schedule)).toEqual({ opens: 540, closes: 780 });
        expect(isClosed(SATURDAY, schedule)).toBe(true);
    });
});

describe('the agenda', () => {
    const at = (id: string, time: string, status: AppointmentStatus): Appointment =>
        ({
            id,
            startsAt: `2026-08-10T${time}:00+03:00`,
            status,
            durationMinutes: 30,
            patient: { id: `p-${id}`, name: id, phone: '' },
        }) as Appointment;

    it('folds away what is settled and keeps what still needs doing', () => {
        const { past, upcoming } = splitDay(
            [
                at('done', '09:30', 'done'),
                at('missed', '10:00', 'no_show'),
                at('stale', '10:45', 'booked'),
                at('later', '13:00', 'booked'),
            ],
            null,
        );

        expect(past.map((row) => row.id)).toEqual(['done', 'missed']);
        expect(upcoming.map((row) => row.id)).toEqual(['stale', 'later']);
    });

    it('does not draw the patient in the chair twice', () => {
        const { upcoming } = splitDay(
            [at('chair', '11:00', 'checked_in'), at('next', '11:30', 'booked')],
            'chair',
        );
        expect(upcoming.map((row) => row.id)).toEqual(['next']);
    });

    it('puts the day in order whatever order it arrived in', () => {
        const { upcoming } = splitDay([at('b', '13:00', 'booked'), at('a', '09:00', 'booked')], null);
        expect(upcoming.map((row) => row.id)).toEqual(['a', 'b']);
    });

    it('labels a row with every procedure the booking planned', () => {
        const planned = (...names: string[]): Appointment =>
            ({
                ...at('x', '09:00', 'booked'),
                procedures: names.map((name, i) => ({
                    id: `l-${i}`,
                    procedureId: `p-${i}`,
                    name,
                    quantity: 1,
                    tooth: null,
                    note: null,
                })),
            }) as Appointment;

        expect(procedureLabel(planned('Consultation'))).toBe('Consultation');
        expect(procedureLabel(planned('Consultation', 'Zirconia crown'))).toBe(
            'Consultation · Zirconia crown',
        );
        // Nothing planned is not "unknown procedure" — the row falls back to
        // the duration alone, as it did when `type_id` was null.
        expect(procedureLabel(planned())).toBeUndefined();
    });
});

describe("the doctor's day", () => {
    const at = (id: string, time: string, status: AppointmentStatus, updatedAt = time): Appointment =>
        ({
            id,
            startsAt: `2026-08-10T${time}:00+03:00`,
            updatedAt: `2026-08-10T${updatedAt}:00+03:00`,
            status,
            durationMinutes: 30,
            patient: { id: `p-${id}`, name: id, phone: '' },
        }) as Appointment;

    const arrivals = (pairs: Record<string, string>) =>
        new Map(Object.entries(pairs).map(([id, time]) => [id, `2026-08-10T${time}:00+03:00`]));

    it('seats whoever checked in first and leaves the rest waiting', () => {
        const day = splitDoctorDay(
            [at('second', '11:35', 'checked_in'), at('first', '11:05', 'checked_in')],
            arrivals({ first: '11:02', second: '11:20' }),
        );

        expect(day.chair?.id).toBe('first');
        expect(day.waiting.map((row) => row.id)).toEqual(['second']);
    });

    it('gives the card to the patient waiting and the strip to the chair', () => {
        const day = splitDoctorDay(
            [
                at('chair', '11:05', 'checked_in'),
                at('waiting', '11:35', 'checked_in'),
                at('booked', '12:00', 'booked'),
            ],
            arrivals({ chair: '11:02', waiting: '11:20' }),
        );

        expect(day.headline?.id).toBe('waiting');
        expect(day.strip?.id).toBe('chair');
        expect(day.list.map((row) => row.id)).toEqual(['booked']);
    });

    it('puts the next slot on the card while the chair keeps the strip', () => {
        const day = splitDoctorDay(
            [at('chair', '11:05', 'checked_in'), at('booked', '12:00', 'booked')],
            arrivals({ chair: '11:02' }),
        );

        expect(day.headline?.id).toBe('booked');
        expect(day.strip?.id).toBe('chair');
        expect(day.list).toEqual([]);
    });

    it('hands the card back to the chair when there is nothing after it', () => {
        const day = splitDoctorDay([at('chair', '11:05', 'checked_in')], arrivals({ chair: '11:02' }));

        expect(day.headline?.id).toBe('chair');
        expect(day.strip).toBeNull();
    });

    it('orders the queue by updatedAt when the visits are not to hand', () => {
        const day = splitDoctorDay([
            at('late', '11:05', 'checked_in', '11:30'),
            at('early', '11:35', 'checked_in', '11:10'),
        ]);

        expect(day.chair?.id).toBe('early');
    });

    it('folds a patient sent to the desk away with the rest of the history', () => {
        const day = splitDoctorDay([
            at('paid', '09:30', 'done'),
            at('desk', '10:00', 'awaiting_payment'),
            at('booked', '12:00', 'booked'),
        ]);

        expect(day.past.map((row) => row.id)).toEqual(['paid', 'desk']);
        expect(day.list).toEqual([]);
        expect(day.headline?.id).toBe('booked');
    });

    it('measures the slot, and says so once it runs over', () => {
        const appointment = at('chair', '11:00', 'checked_in');
        const start = minutesOfDay(appointment.startsAt);

        expect(slotProgress(appointment, start + 15).label).toBe('15 / 30 min');
        expect(slotProgress(appointment, start + 45).over).toBe(true);
        expect(slotProgress(appointment, start + 45).label).toBe('15 min over');
    });
});

describe('errors', () => {
    it('says the slot is taken, and says what to do about it', () => {
        const overlap = new RequestError(ERROR_CODE.SLOT_OVERLAP, 'that slot overlaps another appointment');

        const walkIn = describeError(overlap, 'walk-in');
        expect(walkIn.title).toBe('That slot is taken');
        expect(walkIn.body).toContain('shorter visit');

        expect(describeError(overlap, 'move').title).toBe('That slot is taken');
    });

    it('names the clinic server when the request never arrived', () => {
        const offline = new RequestError(ERROR_CODE.INTERNAL, 'fetch failed', { offline: true });
        expect(describeError(offline, 'check-in').body).toContain('Nothing was saved');
    });
});

describe('money', () => {
    it('formats piastres as whole pounds, grouped', () => {
        expect(formatMoney(260_000)).toBe('EGP 2,600');
        expect(formatMoney(260_000, 'trail')).toBe('2,600 EGP');
        expect(formatMoney(0)).toBe('EGP 0');
    });

    it('takes what has already been paid off the amount due', () => {
        expect(amountDue(260_000, 100_000)).toBe(160_000);
        expect(amountDue(260_000, 0)).toBe(260_000);
        expect(amountDue(50_000, 100_000)).toBe(0);
    });

    it('strips an amount where it is typed, not where it is parsed', () => {
        expect(poundsEntry('12.5')).toBe('125');
        expect(poundsEntry('1,200')).toBe('1200');
    });
});

describe('dates', () => {
    it('speaks in the days the secretary uses', () => {
        const today = dateKey(new Date());
        expect(relativeDayLabel(today, today)).toBe('Today');
        expect(relativeDayLabel(addDays(today, 1), today)).toBe('Tomorrow');
        expect(relativeDayLabel(addDays(today, -1), today)).toBe('Yesterday');
    });

    it('round-trips a clock through minutes', () => {
        expect(clockToMinutes('09:05')).toBe(545);
        expect(minutesToClock(545)).toBe('09:05');
    });

    it('splits the twelve-hour clock from its meridiem, and never says 0:15', () => {
        expect(clock12(11 * 60 + 35)).toEqual({ time: '11:35', meridiem: 'AM' });
        expect(clock12(13 * 60)).toEqual({ time: '1:00', meridiem: 'PM' });
        expect(clock12(0)).toEqual({ time: '12:00', meridiem: 'AM' });
        expect(clock12(12 * 60)).toEqual({ time: '12:00', meridiem: 'PM' });
    });

    it('names the weekday in the header pill only when the day is not today', () => {
        const today = dateKey(new Date());
        expect(formatDatePill(today, today).split(' ')).toHaveLength(2);
        expect(formatDatePill(addDays(today, 2), today).split(' ')).toHaveLength(3);
        expect(formatDatePill(today, today)).toBe(formatDatePill(today, today).toUpperCase());
    });
});
