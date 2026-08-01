import { describe, expect, test } from 'bun:test';
import type { IsoDate } from '@mawid/shared';
import {
    addDays,
    clinicDay,
    clinicTimeToInstant,
    formatClinicTime,
    minutesBetween,
    weekdayOf,
} from './datetime.ts';

const CAIRO = 'Africa/Cairo';

describe('clinicTimeToInstant', () => {
    test('converts standard time (UTC+2 in winter)', () => {
        expect(clinicTimeToInstant('2026-01-15' as IsoDate, '10:00', CAIRO)).toBe('2026-01-15T08:00:00.000Z');
    });

    test('converts summer time (UTC+3 — Egypt observes DST)', () => {
        expect(clinicTimeToInstant('2026-08-01' as IsoDate, '10:00', CAIRO)).toBe('2026-08-01T07:00:00.000Z');
    });

    test('round-trips through clinicDay for a late evening slot', () => {
        // 21:00 Cairo is 18:00Z the same day; the bug this guards is the reverse
        // case, where a UTC slice lands on the wrong calendar day.
        const instant = clinicTimeToInstant('2026-08-01' as IsoDate, '21:00', CAIRO);
        expect(clinicDay(instant, CAIRO)).toBe('2026-08-01');
    });
});

describe('clinicDay', () => {
    test('an instant before clinic midnight still belongs to the previous day', () => {
        // 2026-08-02T00:30Z is 03:30 on the 2nd in Cairo.
        expect(clinicDay('2026-08-02T00:30:00.000Z', CAIRO)).toBe('2026-08-02');
        // 2026-08-01T22:30Z is 01:30 on the 2nd in Cairo — the slice would say the 1st.
        expect(clinicDay('2026-08-01T22:30:00.000Z', CAIRO)).toBe('2026-08-02');
    });
});

describe('formatClinicTime', () => {
    test('renders 24-hour clinic-local time with Latin digits in both locales', () => {
        const instant = '2026-08-01T07:00:00.000Z';
        expect(formatClinicTime(instant, CAIRO, 'en')).toBe('10:00');
        expect(formatClinicTime(instant, CAIRO, 'ar')).toBe('10:00');
    });
});

describe('addDays', () => {
    test('crosses a month boundary', () => {
        expect(addDays('2026-07-31' as IsoDate, 1)).toBe('2026-08-01');
    });

    test('goes backwards across a year boundary', () => {
        expect(addDays('2026-01-01' as IsoDate, -1)).toBe('2025-12-31');
    });
});

describe('weekdayOf', () => {
    test('0 is Sunday, matching config.hours', () => {
        expect(weekdayOf('2026-08-02' as IsoDate)).toBe('0');
        expect(weekdayOf('2026-08-01' as IsoDate)).toBe('6');
    });
});

describe('minutesBetween', () => {
    test('measures a gap in the day list', () => {
        expect(minutesBetween('2026-08-01T07:00:00.000Z', '2026-08-01T08:30:00.000Z')).toBe(90);
    });
});
