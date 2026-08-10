// The one place this cluster knows anything about answer types. Custom
// questions are dentist-defined; nothing about any clinic's questionnaire is
// written down here, so a question is only ever a kind, a label and a key.
// `date` is deliberately not in `EDITABLE_KINDS` (§7.9): the server stores it,
// the record displays it read-only, and it never disappears or crashes a
// record. Adding it later is putting `'date'` in `EDITABLE_KINDS` and returning
// a control from its case. `''` is a cleared answer, which the server deletes
// from `patients.custom` rather than storing blank. Validation here is early
// feedback only — the server validates the patch again.
import type { CustomQuestion, QuestionKind } from '../data/types';

export const EDITABLE_KINDS = ['text', 'number', 'boolean', 'select'] as const;

export type EditableKind = (typeof EDITABLE_KINDS)[number];

export function isEditable(question: CustomQuestion): question is CustomQuestion & { kind: EditableKind } {
    return (EDITABLE_KINDS as readonly QuestionKind[]).includes(question.kind);
}

export type DraftValue = string | boolean;

export type Draft = Record<string, DraftValue>;

export function toDraft(question: CustomQuestion, stored: unknown): DraftValue {
    if (question.kind === 'boolean') return stored === true;
    if (stored === undefined || stored === null) return '';
    return String(stored);
}

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

export function validateDraft(question: CustomQuestion, draft: DraftValue): string | null {
    if (question.kind === 'boolean') return null;
    const value = typeof draft === 'string' ? draft.trim() : '';

    if (value === '') return question.required ? 'This question has to be answered' : null;

    if (question.kind === 'number' && !Number.isFinite(Number(value))) {
        return 'Enter a number';
    }
    if (question.kind === 'select' && !(question.options ?? []).includes(value)) {
        return 'Pick one of the options';
    }
    return null;
}

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

export function isReadOnly(question: CustomQuestion): boolean {
    return !isEditable(question);
}
