import { describe, expect, test } from 'bun:test';
import { reminderDueCutoff } from './reminder.ts';

// Cairo in summer: 17:00 local is 14:00 UTC.
const CAIRO = 180;

function at(iso: string): Date {
    return new Date(iso);
}

describe('reminderDueCutoff', () => {
    test('before the notify time, only what is due by now', () => {
        const now = at('2026-09-28T13:59:00Z');
        expect(reminderDueCutoff({ now, notifyAt: '17:00', offsetMinutes: CAIRO })).toEqual(now);
    });

    test('from the notify time, everything due before local midnight', () => {
        const cutoff = reminderDueCutoff({
            now: at('2026-09-28T14:00:00Z'),
            notifyAt: '17:00',
            offsetMinutes: CAIRO,
        });
        // 23:59:59.999 in Cairo on the 28th.
        expect(cutoff.toISOString()).toBe('2026-09-28T20:59:59.999Z');
    });

    test('reads the seconds form Postgres returns', () => {
        const cutoff = reminderDueCutoff({
            now: at('2026-09-28T14:00:00Z'),
            notifyAt: '17:00:00',
            offsetMinutes: CAIRO,
        });
        expect(cutoff.toISOString()).toBe('2026-09-28T20:59:59.999Z');
    });

    test('with throughToday, the end of the day even before the notify time', () => {
        const cutoff = reminderDueCutoff({
            now: at('2026-09-28T06:00:00Z'),
            notifyAt: '17:00',
            offsetMinutes: CAIRO,
            throughToday: true,
        });
        expect(cutoff.toISOString()).toBe('2026-09-28T20:59:59.999Z');
    });

    test('the day is the local one, not the UTC one', () => {
        // 22:30 UTC on the 28th is 01:30 on the 29th in Cairo: a new day, before
        // its notify time.
        const now = at('2026-09-28T22:30:00Z');
        expect(reminderDueCutoff({ now, notifyAt: '17:00', offsetMinutes: CAIRO })).toEqual(now);

        // 23:30 local on the 28th is still the 28th's evening.
        const late = reminderDueCutoff({
            now: at('2026-09-28T20:30:00Z'),
            notifyAt: '17:00',
            offsetMinutes: CAIRO,
        });
        expect(late.toISOString()).toBe('2026-09-28T20:59:59.999Z');
    });

    test('a negative offset places the day west of UTC', () => {
        // 01:00 UTC on the 29th is 21:00 on the 28th at UTC-4.
        const cutoff = reminderDueCutoff({
            now: at('2026-09-29T01:00:00Z'),
            notifyAt: '17:00',
            offsetMinutes: -240,
        });
        expect(cutoff.toISOString()).toBe('2026-09-29T03:59:59.999Z');
    });
});
