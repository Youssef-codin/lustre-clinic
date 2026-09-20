import { describe, expect, test } from 'bun:test';
import { minutesFromTime, TEMPLATE_MAX, templateDraft, timeFromMinutes } from './data/reminders';

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

/**
 * The template field used to write on blur, which on Android is a blur that
 * never arrives when the pane is left by the header or the back gesture: the
 * edit went nowhere and nothing said so. It has an explicit Save now, and what
 * that button may do is decided here.
 */
describe('the reminder template draft', () => {
    const SAVED = 'Hello {name}, see you {date} at {time}.';

    test('shows the saved message until something is typed', () => {
        const draft = templateDraft(null, SAVED);

        expect(draft.text).toBe(SAVED);
        expect(draft.dirty).toBe(false);
        expect(draft.canSave).toBe(false);
        expect(draft.issue).toBeNull();
    });

    test('offers the save once the message differs', () => {
        const draft = templateDraft('See you {date}.', SAVED);

        expect(draft.dirty).toBe(true);
        expect(draft.canSave).toBe(true);
    });

    test('does not offer a save that would write the message back unchanged', () => {
        // The server trims, so this round trips to exactly what is stored.
        const draft = templateDraft(`  ${SAVED}  `, SAVED);

        expect(draft.dirty).toBe(false);
        expect(draft.canSave).toBe(false);
    });

    test('blocks an empty message and says why', () => {
        const draft = templateDraft('   ', SAVED);

        expect(draft.canSave).toBe(false);
        expect(draft.issue).toBe('The message cannot be empty.');
    });

    test('blocks an over-long message and counts the overage', () => {
        const draft = templateDraft('x'.repeat(TEMPLATE_MAX + 3), SAVED);

        expect(draft.canSave).toBe(false);
        expect(draft.issue).toContain('Too long by 3 characters');
    });

    test('counts a single character over in the singular', () => {
        expect(templateDraft('x'.repeat(TEMPLATE_MAX + 1), SAVED).issue).toContain(
            'Too long by 1 character.',
        );
    });

    test('allows a message exactly at the limit', () => {
        const draft = templateDraft('x'.repeat(TEMPLATE_MAX), SAVED);

        expect(draft.issue).toBeNull();
        expect(draft.canSave).toBe(true);
    });

    // The server accepts 1000 characters and this pane holds 320, so a message
    // saved elsewhere can arrive too long for the field. The pane explains the
    // unavailable Save; it must not claim the stored message is unsaved.
    test('explains an unsaveable saved message without calling it an edit', () => {
        const draft = templateDraft(null, 'x'.repeat(TEMPLATE_MAX + 10));

        expect(draft.dirty).toBe(false);
        expect(draft.canSave).toBe(false);
        expect(draft.issue).toContain('Too long by 10 characters');
    });
});
