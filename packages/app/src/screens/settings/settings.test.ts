import { describe, expect, test } from 'bun:test';
import { ageInDays, backupView, formatAge } from './data/backups';
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

describe('backup status on the index', () => {
    const now = Date.parse('2026-09-20T09:00:00Z');
    const ok = {
        lastSuccessAt: '2026-09-20T03:00:00Z',
        stale: false,
        staleAfterHours: 48,
        offsite: { configured: true, reauthorizationRequiredSince: null },
    };

    test('says nothing loud when the clinic is backed up', () => {
        const view = backupView(ok, now);
        expect(view.tone).toBe('ok');
        expect(view.sub).toBe('Last backup today · copied off-site');
        expect(view.detail).toBeNull();
    });

    test('names the machine when there is no off-site copy configured', () => {
        const view = backupView({ ...ok, offsite: { ...ok.offsite, configured: false } }, now);
        expect(view.sub).toBe('Last backup today · on this machine only');
    });

    // The dump still runs and still verifies, so nothing else on the phone looks
    // wrong — this row is the only place the doctor can find out.
    test('a revoked grant outranks everything else on the row', () => {
        const view = backupView(
            {
                ...ok,
                stale: true,
                offsite: { configured: true, reauthorizationRequiredSince: '2026-09-17T03:00:00Z' },
            },
            now,
        );

        expect(view.tone).toBe('reauthorize');
        expect(view.sub).toBe('Google Drive needs a new sign-in');
        expect(view.detail).toContain('stopped for 3 days');
        expect(view.detail).toContain('sign in to Google Drive again');
    });

    test('does not say "0 days" on the day it breaks', () => {
        const view = backupView(
            { ...ok, offsite: { configured: true, reauthorizationRequiredSince: '2026-09-20T07:00:00Z' } },
            now,
        );
        expect(view.detail).not.toContain('0 days');
        expect(view.detail).toContain('The off-site copy has stopped.');
    });

    test('falls back to stale when the grant is fine but nothing has run', () => {
        const view = backupView({ ...ok, lastSuccessAt: null, stale: true }, now);
        expect(view.tone).toBe('stale');
        expect(view.sub).toBe('No backup yet');
        expect(view.detail).toContain('48 hours');
    });

    test('reads an unparseable timestamp as no backup rather than throwing', () => {
        expect(backupView({ ...ok, lastSuccessAt: 'not-a-date', stale: true }, now).sub).toBe(
            'No backup yet',
        );
        expect(ageInDays('not-a-date', now)).toBeNull();
    });

    test('reads one day as yesterday rather than "1 days"', () => {
        const view = backupView(
            { ...ok, offsite: { configured: true, reauthorizationRequiredSince: '2026-09-19T03:00:00Z' } },
            now,
        );
        expect(view.detail).toContain('since yesterday');
    });

    test('never reports a negative age from a clock that disagrees', () => {
        expect(ageInDays('2026-09-21T09:00:00Z', now)).toBe(0);
        expect(formatAge(0)).toBe('today');
        expect(formatAge(1)).toBe('yesterday');
    });
});
