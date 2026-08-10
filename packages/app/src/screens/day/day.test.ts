import { describe, expect, it } from 'bun:test';
import { ERROR_CODE } from '@mawid/shared';
import { RequestError } from './data/client';
import { describeError } from './errors';
import { hoursFor, isClosed, openMinutes, timelineBounds } from './hours';
import { assignLanes } from './layout';
import { amountDue, formatMoney, poundsEntry } from './money';
import { addDays, clockToMinutes, dateKey, minutesToClock, relativeDayLabel } from './time';

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

    it('grows the timeline around an appointment booked outside opening hours', () => {
        const bounds = timelineBounds(SATURDAY, undefined, [
            { startMinutes: 8 * 60 + 30, endMinutes: 9 * 60 },
        ]);
        expect(bounds.opens).toBe(8 * 60);
        expect(bounds.closes).toBe(22 * 60);
    });
});

describe('timeline layout', () => {
    it('keeps consecutive appointments in one lane', () => {
        const lanes = assignLanes([
            { startMinutes: 600, endMinutes: 630 },
            { startMinutes: 630, endMinutes: 660 },
        ]);
        expect(lanes).toEqual([
            { lane: 0, lanes: 1 },
            { lane: 0, lanes: 1 },
        ]);
    });

    it('splits overlapping ones, and only within their own cluster', () => {
        const lanes = assignLanes([
            { startMinutes: 600, endMinutes: 660 }, // overlaps the next
            { startMinutes: 630, endMinutes: 690 },
            { startMinutes: 900, endMinutes: 930 }, // alone, later
        ]);

        expect(lanes[0]).toEqual({ lane: 0, lanes: 2 });
        expect(lanes[1]).toEqual({ lane: 1, lanes: 2 });
        expect(lanes[2]).toEqual({ lane: 0, lanes: 1 });
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
});
