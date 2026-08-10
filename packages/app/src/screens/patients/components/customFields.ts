import type { CustomQuestion, QuestionKind } from '../data/types';

/**
 * The one place this cluster knows anything about answer types.
 *
 * Custom questions are dentist-defined: the clinic writes the label, picks the
 * kind, and the record renders whatever comes back from `customQuestion.list`.
 * Nothing about any particular clinic's questionnaire is written down anywhere
 * in this cluster — the same codebase runs a second clinic, so a question is
 * only ever a `kind`, a `label` and a `key`.
 *
 * ## Where `date` drops in
 *
 * §7.9. The server already accepts a `date` answer and stores it as a
 * `YYYY-MM-DD` string, so a record can arrive holding one — but there is no
 * date control in `ui/` and picking a calendar is not this cluster's decision
 * to make. So `date` is *displayed* and not *edited*: `EDITABLE_KINDS` leaves
 * it out, `answerControl` has an explicit case saying so, and the record shows
 * the stored value as read-only with the reason next to it. It never
 * disappears, and it never crashes a record that has one.
 *
 * Adding it later is: put `'date'` in `EDITABLE_KINDS`, and return a control
 * from its case. Nothing else in the cluster branches on kind.
 */

/** The kinds this cluster can edit today. `date` is knowingly absent (§7.9). */
export const EDITABLE_KINDS = ['text', 'number', 'boolean', 'select'] as const;

export type EditableKind = (typeof EDITABLE_KINDS)[number];

export function isEditable(question: CustomQuestion): question is CustomQuestion & { kind: EditableKind } {
    return (EDITABLE_KINDS as readonly QuestionKind[]).includes(question.kind);
}

/**
 * What an unedited control holds. Text, number and select all edit as strings;
 * a boolean is a switch, and its draft is the switch.
 */
export type DraftValue = string | boolean;

export type Draft = Record<string, DraftValue>;

/** The stored answer, in the form its control edits. */
export function toDraft(question: CustomQuestion, stored: unknown): DraftValue {
    if (question.kind === 'boolean') return stored === true;
    if (stored === undefined || stored === null) return '';
    return String(stored);
}

/**
 * The draft, in the form `patient.update` takes. `''` is a cleared answer,
 * which the server deletes from `patients.custom` rather than storing blank.
 */
export function fromDraft(question: CustomQuestion, draft: DraftValue): unknown {
    if (question.kind === 'boolean') return draft === true;
    if (typeof draft !== 'string') return draft;

    const trimmed = draft.trim();
    if (trimmed === '') return '';
    if (question.kind === 'number') {
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : trimmed;
    }
    return trimmed;
}

/**
 * The message to put under the control, or null if it is fine. The server
 * validates all of this again — this is so the secretary finds out before the
 * round trip, not instead of it.
 */
export function validateDraft(question: CustomQuestion, draft: DraftValue): string | null {
    if (question.kind === 'boolean') return null;
    const value = typeof draft === 'string' ? draft.trim() : '';

    if (value === '') return question.required ? 'This question has to be answered' : null;

    if (question.kind === 'number' && !Number.isFinite(Number(value))) {
        return 'Enter a number';
    }
    if (question.kind === 'select' && !(question.options ?? []).includes(value)) {
        // Reachable: the stored answer was valid when it was given and the
        // question has narrowed since (`answer_no_longer_valid`).
        return 'Pick one of the options';
    }
    return null;
}

/**
 * The stored answer as one line of display text, or null when there is none.
 *
 * Every kind is handled, including the ones with no editor, because a record
 * holding an answer must show it whatever the questionnaire has done since.
 */
export function displayAnswer(question: CustomQuestion, stored: unknown): string | null {
    if (stored === undefined || stored === null || stored === '') return null;

    switch (question.kind) {
        case 'boolean':
            return stored === true ? 'Yes' : 'No';
        case 'number':
        case 'text':
        case 'select':
        case 'date':
            return String(stored);
    }
}

/** True for an answer the record can show but not change. */
export function isReadOnly(question: CustomQuestion): boolean {
    return !isEditable(question);
}
