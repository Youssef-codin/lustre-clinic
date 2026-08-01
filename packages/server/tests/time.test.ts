import { describe, expect, test } from 'bun:test';
import type { WorkingHours } from '@mawid/shared';
import {
    addDays,
    clinicDate,
    clinicDayBounds,
    clinicTimeToInstant,
    fitsWorkingHours,
    toClinicClock,
    weekdayOf,
    workingIntervals,
} from '../src/util/time.ts';

/**
 * Cairo is UTC+2 in winter and UTC+3 under DST, which Egypt reintroduced in
 * 2023 — last Friday of April to last Thursday of October. Every case below is
 * pinned to one side of that so a conversion bug shows up as an hour, not as a
 * flake.
 */
const TZ = 'Africa/Cairo';

/** Mon 2026-08-03: 10:00–14:00 and 17:00–21:00. Fri closed — no `5` key. */
const HOURS: WorkingHours = {
    '1': [
        { from: '10:00', to: '14:00' },
        { from: '17:00', to: '21:00' },
    ],
    '6': [{ from: '17:00', to: '21:00' }],
};

describe('clinic-local wall clock → UTC instant', () => {
    test('summer is UTC+3', () => {
        expect(clinicTimeToInstant('2026-08-03', '10:00', TZ).toISOString()).toBe('2026-08-03T07:00:00.000Z');
    });

    test('winter is UTC+2', () => {
        expect(clinicTimeToInstant('2026-01-15', '10:00', TZ).toISOString()).toBe('2026-01-15T08:00:00.000Z');
    });

    test('the day before DST begins is still UTC+2', () => {
        expect(clinicTimeToInstant('2026-04-23', '10:00', TZ).toISOString()).toBe('2026-04-23T08:00:00.000Z');
    });

    test('the day after DST begins is UTC+3', () => {
        expect(clinicTimeToInstant('2026-04-25', '10:00', TZ).toISOString()).toBe('2026-04-25T07:00:00.000Z');
    });

    test('the day after DST ends is back to UTC+2', () => {
        expect(clinicTimeToInstant('2026-11-01', '10:00', TZ).toISOString()).toBe('2026-11-01T08:00:00.000Z');
    });

    test('round-trips through the clinic clock', () => {
        const instant = clinicTimeToInstant('2026-08-03', '17:30', TZ);
        expect(toClinicClock(instant, TZ)).toEqual({ date: '2026-08-03', time: '17:30', weekday: 1 });
    });
});

describe('clinic-local calendar day', () => {
    test('an instant late at night belongs to the clinic day, not the UTC day', () => {
        // 23:30 Cairo on the 3rd is 20:30Z the same day...
        expect(clinicDate('2026-08-03T20:30:00.000Z', TZ)).toBe('2026-08-03');
        // ...but 00:30 Cairo on the 4th is 21:30Z on the 3rd, and belongs to the 4th.
        expect(clinicDate('2026-08-03T21:30:00.000Z', TZ)).toBe('2026-08-04');
    });

    test('day bounds cover exactly 24 hours outside a DST change', () => {
        const { start, end } = clinicDayBounds('2026-08-03', TZ);
        expect(start.toISOString()).toBe('2026-08-02T21:00:00.000Z');
        expect(end.toISOString()).toBe('2026-08-03T21:00:00.000Z');
    });

    test('weekday matches the keys of config.hours, 0 = Sunday', () => {
        expect(weekdayOf('2026-08-02')).toBe('0');
        expect(weekdayOf('2026-08-03')).toBe('1');
        expect(weekdayOf('2026-08-07')).toBe('5');
    });

    test('addDays crosses a month boundary', () => {
        expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    });
});

describe('working hours', () => {
    test('a day with two windows yields both, in UTC', () => {
        const intervals = workingIntervals('2026-08-03', HOURS, TZ);

        expect(intervals).toHaveLength(2);
        expect(intervals[0]?.start.toISOString()).toBe('2026-08-03T07:00:00.000Z');
        expect(intervals[0]?.end.toISOString()).toBe('2026-08-03T11:00:00.000Z');
        expect(intervals[1]?.start.toISOString()).toBe('2026-08-03T14:00:00.000Z');
        expect(intervals[1]?.end.toISOString()).toBe('2026-08-03T18:00:00.000Z');
    });

    test('an omitted day is closed', () => {
        expect(workingIntervals('2026-08-07', HOURS, TZ)).toHaveLength(0);
    });

    test('an appointment inside a window fits', () => {
        expect(fitsWorkingHours('2026-08-03T08:00:00.000Z', 30, HOURS, TZ)).toBe(true);
    });

    test('an appointment ending exactly at closing fits', () => {
        expect(fitsWorkingHours('2026-08-03T10:30:00.000Z', 30, HOURS, TZ)).toBe(true);
    });

    test('an appointment starting exactly at opening fits', () => {
        expect(fitsWorkingHours('2026-08-03T07:00:00.000Z', 30, HOURS, TZ)).toBe(true);
    });

    test('an appointment running past closing does not fit', () => {
        expect(fitsWorkingHours('2026-08-03T10:45:00.000Z', 30, HOURS, TZ)).toBe(false);
    });

    test('an appointment in the afternoon gap does not fit', () => {
        // 12:00Z is 15:00 Cairo — after the morning window, before the evening one.
        expect(fitsWorkingHours('2026-08-03T12:00:00.000Z', 30, HOURS, TZ)).toBe(false);
    });

    test('nothing fits on a closed day', () => {
        expect(fitsWorkingHours('2026-08-07T08:00:00.000Z', 30, HOURS, TZ)).toBe(false);
    });
});
