import { describe, expect, test } from 'bun:test';
import {
    cutoffDigits,
    cutoffDigitsOf,
    cutoffError,
    cutoffIso,
    patientNumberDigits,
    patientNumberError,
} from './data/clinic';
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

/**
 * The patient number is the number the **next new patient will be given**. It
 * used to be the last one handed out, labelled `Last patient number`, and every
 * clinic that typed 910 into it watched the next patient come out as 911 —
 * because the field said "last" and everybody read it as "next".
 *
 * The 910/911 report is asserted on the server, where the counter actually
 * lives (`tests/modules.test.ts`). What is left here is what the field itself
 * can refuse without seeing the register.
 */
describe('the next patient number', () => {
    test('takes digits and nothing else', () => {
        expect(patientNumberDigits('910')).toBe('910');
        expect(patientNumberDigits('9 1 0')).toBe('910');
        expect(patientNumberDigits('91o')).toBe('91');
        expect(patientNumberDigits('12345678901234')).toBe('1234567890');
    });

    test('accepts the figure a clinic carrying on from a paper count types', () => {
        expect(patientNumberError('910')).toBeNull();
        expect(patientNumberError('1')).toBeNull();
    });

    test('refuses a blank, and says what the field is for', () => {
        expect(patientNumberError('')).toContain('next new patient');
        expect(patientNumberError('   ')).toContain('next new patient');
    });

    // Zero was valid under the old meaning — "no numbers handed out yet" — and
    // is not under this one: nobody writes patient 0 at the top of a file.
    test('refuses zero, which the old meaning allowed', () => {
        expect(patientNumberError('0')).toContain('first patient number is 1');
    });

    test('refuses a number the column cannot hold', () => {
        expect(patientNumberError('2147483647')).toBeNull();
        expect(patientNumberError('2147483648')).toContain('larger than');
    });
});

/**
 * The cutoff an old patient's carried-over money and history are dated at. It
 * moved here from the Settings → Data entry screen, which asked for it once per
 * session; that screen is gone and this is a fact about the clinic, answered
 * once. The rule is its own: a date of birth is refused for being too early,
 * this for being in the future — the old system stopped being the truth on a
 * day that has already happened.
 */
describe('the migration cutoff', () => {
    const TODAY = '2026-09-20';

    test('reads a complete day as an ISO date', () => {
        expect(cutoffIso('01082026', TODAY)).toBe('2026-08-01');
    });

    test('refuses a day that has not happened', () => {
        expect(cutoffIso('01102026', TODAY)).toBeNull();
        expect(cutoffError('01102026', TODAY)).toContain('day that has happened');
    });

    test('refuses a day that is not one', () => {
        expect(cutoffIso('31022026', TODAY)).toBeNull();
    });

    test('says nothing while the date is still being typed', () => {
        expect(cutoffError('', TODAY)).toBeNull();
        expect(cutoffError('0108', TODAY)).toContain('Day, month and year');
    });

    test('opens on what the clinic stored, and on nothing when it stored nothing', () => {
        expect(cutoffDigitsOf('2026-08-01')).toBe('01082026');
        expect(cutoffDigitsOf(null)).toBe('');
    });

    test('round trips what it opened on', () => {
        expect(cutoffIso(cutoffDigitsOf('2026-08-01'), TODAY)).toBe('2026-08-01');
    });

    test('takes eight digits and strips the rest', () => {
        expect(cutoffDigits('01 / 08 / 2026')).toBe('01082026');
        expect(cutoffDigits('010820269')).toBe('01082026');
    });
});
