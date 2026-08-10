import { describe, expect, it } from 'bun:test';
import { type AppointmentStatus, ERROR_CODE } from '@mawid/shared';
import { splitDay } from './agenda';
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
    minutesToClock,
    relativeDayLabel,
} from './time';

// There is no renderer under `bun test`, so what is tested here is the part of
// the screen that is not React: which day is closed, where a block lands, and —
// the one that matters — what the secretary is told when Postgres refuses a
// double booking.

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
        // Saturday has no row in this schedule, so the clinic is shut.
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
                // Its slot is long gone, and nobody has said what happened. That
                // is a decision waiting to be made, not history.
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
});

describe('errors', () => {
    it('says the slot is taken, and says what to do about it', () => {
        const overlap = new RequestError(ERROR_CODE.SLOT_OVERLAP, 'that slot overlaps another appointment');

        const walkIn = describeError(overlap, 'walk-in');
        expect(walkIn.title).toBe('That slot is taken');
        expect(walkIn.body).toContain('shorter visit');

        // Never the generic failure, whatever the screen it came from.
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
        // A visit part-paid before checkout: `Full` must offer the remainder,
        // not the whole charge, or the patient pays that part twice and the
        // balance goes negative (§7.6).
        expect(amountDue(260_000, 100_000)).toBe(160_000);
        expect(amountDue(260_000, 0)).toBe(260_000);
        // A discount below what is already paid settles it; it never refunds.
        expect(amountDue(50_000, 100_000)).toBe(0);
    });

    it('strips an amount where it is typed, not where it is parsed', () => {
        // `decimal-pad` shows a `.` key. Stripping it only on parse would read
        // a typed 12.5 as 125 with the field still saying 12.5; running the
        // entry through this on the way in makes the two say the same thing.
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
        // `4 AUG` on today, `WED 5 AUG` off it — and uppercase either way.
        expect(formatDatePill(today, today).split(' ')).toHaveLength(2);
        expect(formatDatePill(addDays(today, 2), today).split(' ')).toHaveLength(3);
        expect(formatDatePill(today, today)).toBe(formatDatePill(today, today).toUpperCase());
    });
});
