import { describe, expect, test } from 'bun:test';
import { minutesFromTime, timeFromMinutes } from './data/reminders';

/**
 * The one shape the settings cluster converts rather than passes through:
 * `reminder_notify_at` is a Postgres `time` and the pane's stepper counts
 * minutes from midnight. A round trip that drifted would move the daily
 * notification every time the pane was opened and saved.
 */

describe('reminder notify time', () => {
    test('reads the column, seconds or not', () => {
        expect(minutesFromTime('00:00')).toBe(0);
        expect(minutesFromTime('06:30')).toBe(390);
        expect(minutesFromTime('19:00')).toBe(1140);
        expect(minutesFromTime('19:00:00')).toBe(1140);
        expect(minutesFromTime('23:59')).toBe(1439);
    });

    test('writes what `updateSettingsInput` accepts', () => {
        expect(timeFromMinutes(0)).toBe('00:00');
        expect(timeFromMinutes(390)).toBe('06:30');
        expect(timeFromMinutes(1140)).toBe('19:00');
        expect(timeFromMinutes(1439)).toBe('23:59');
    });

    test('survives a round trip at every step the pane can land on', () => {
        // The stepper moves in hours between 6 AM and 9 PM.
        for (let minutes = 6 * 60; minutes <= 21 * 60; minutes += 60) {
            expect(minutesFromTime(timeFromMinutes(minutes))).toBe(minutes);
        }
    });

    test('wraps rather than writing a time Postgres would refuse', () => {
        expect(timeFromMinutes(24 * 60)).toBe('00:00');
        expect(timeFromMinutes(-60)).toBe('23:00');
    });
});
