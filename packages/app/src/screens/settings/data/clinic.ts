/**
 * The two things Settings → Clinic decides that are not just text in a box, and
 * neither of them is React, so both are tested without a renderer.
 *
 * ## The next patient number
 *
 * It is the number the **next new patient will be given** — not the last one
 * handed out. It used to be the latter, labelled `Last patient number`, and
 * every clinic that typed 910 into it watched the next patient come out as 911.
 * The field says "next" now, the column says `patient_ref_next`, and the value
 * is handed out as it stands.
 *
 * One is the lowest it can be, because a patient numbered zero is not a number
 * anyone writes on a file. The server refuses a value at or below a ref a
 * patient already has — it is the only side that can see the register — so this
 * only checks what the field itself can know.
 *
 * ## The migration cutoff
 *
 * Where an old patient's carried-over money and history are dated. Typed as
 * digits and shown with separators, the way `domain/patientDraft`'s date of
 * birth is — the same keypad, the same rhythm, so the desk learns one date
 * field and not two. The rule on top is not that module's: a date of birth is
 * refused for being too early and a cutoff for being in the future. The old
 * system stopped being the truth on a day that has already happened.
 *
 * This moved here from `dataEntry/entryForm.ts`, which asked for it once per
 * data-entry session. The screen that asked is gone — registering an old
 * patient is the New patient screen's **Old patient** switch — and the cutoff
 * is a fact about the clinic, answered once.
 */
import { MAX_PATIENT_REF } from '@lustre/shared';
import { serverToday as todayKey } from '../../../api/serverClock';
import { calendarIsoOf } from '../../../components/domain/patientDraft';

export { dateDigitsDisplay as cutoffDisplay } from '../../../components/domain/patientDraft';

export function patientNumberDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, 10);
}

/** What is wrong with the typed next number, or null. Blank counts as wrong — the field is required. */
export function patientNumberError(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed === '') return 'Type the number the next new patient should get.';

    const number = Number(trimmed);
    if (!Number.isInteger(number) || number < 1) return 'The first patient number is 1.';
    if (number > MAX_PATIENT_REF) return 'That number is larger than the system will hold.';

    return null;
}

// --- the cutoff date ------------------------------------------------------

const CUTOFF_DIGITS = 8;

export function cutoffDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, CUTOFF_DIGITS);
}

/** `YYYY-MM-DD` for the server, or null while the entry is incomplete or impossible. */
export function cutoffIso(digits: string, today: string = todayKey()): string | null {
    const iso = calendarIsoOf(digits);
    return iso === null || iso > today ? null : iso;
}

export function cutoffError(digits: string, today: string = todayKey()): string | null {
    if (digits.length === 0) return null;
    if (digits.length < CUTOFF_DIGITS) return 'Day, month and year — 01 / 08 / 2026.';
    return cutoffIso(digits, today) === null ? 'The cutoff has to be a day that has happened.' : null;
}

/** Digits for a date already stored, so the field opens on what the clinic set rather than empty. */
export function cutoffDigitsOf(iso: string | null): string {
    if (iso === null) return '';
    const [year = '', month = '', day = ''] = iso.split('-');
    return `${day}${month}${year}`;
}

/**
 * The cutoff and the branch travel together or not at all. A cutoff with no
 * branch has nowhere to hang an opening balance, and a branch with no cutoff
 * has no day to date it on — the server would store either half and then refuse
 * every old patient with `MIGRATION_NOT_CONFIGURED`, which names neither. Said
 * here, on the pane, instead.
 */
export function migrationIssue(cutoffDigits: string, branchId: string | null): string | null {
    const hasCutoff = cutoffDigits !== '';
    const hasBranch = branchId !== null;
    if (hasCutoff === hasBranch) return null;
    return hasCutoff
        ? 'Pick the branch the old patients belong to, or clear the cutoff date.'
        : 'Set the cutoff date, or set the branch back to Not set.';
}
