// `_Local` per §10: stands in for the tRPC client, which is not an app
// dependency yet. Not a constant stub: it reimplements the server's answer
// validation and gap audit over the fixtures, so the screens meet the real
// failure modes; swapping in the real client is replacing the function bodies.
// Writes are slower than reads on purpose — that is where a second tap books a
// second write. A search or answer containing `!fail` forces a transport error
// on a device; it is the only magic string. The store is mutable so an edit
// survives navigating away and back; values are cloned on the way out. The UI
// switches on the error `code` and never parses the message.
import { CUSTOM_QUESTIONS, PATIENTS, VISITS } from './fixtures';
import type {
    Answers,
    CustomQuestion,
    Patient,
    PatientBalance,
    PatientDetail,
    QuestionnaireGap,
    QuestionnaireGapReason,
    UpdatePatientInput,
} from './types';

const READ_MS = 320;
const WRITE_MS = 700;

const FAIL = '!fail';

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class _LocalApiError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = '_LocalApiError';
        this.code = code;
    }
}

const store = {
    patients: PATIENTS.map((p) => ({ ...p, custom: { ...p.custom } })),
    questions: CUSTOM_QUESTIONS.map((q) => ({ ...q })),
};

function clone(patient: Patient): Patient {
    return { ...patient, custom: { ...patient.custom } };
}

function require_(id: string): Patient {
    const found = store.patients.find((p) => p.id === id);
    if (!found) throw new _LocalApiError('NOT_FOUND', 'patient not found');
    return found;
}

function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

function coerce(question: CustomQuestion, value: unknown): unknown {
    switch (question.kind) {
        case 'text':
            if (typeof value !== 'string') throw wrongKind(question, 'a string');
            return value;
        case 'number': {
            const n = typeof value === 'string' ? Number(value) : value;
            if (typeof n !== 'number' || !Number.isFinite(n)) throw wrongKind(question, 'a number');
            return n;
        }
        case 'boolean':
            if (typeof value !== 'boolean') throw wrongKind(question, 'a boolean');
            return value;
        case 'date':
            if (typeof value !== 'string' || !isCalendarDate(value)) {
                throw wrongKind(question, 'a YYYY-MM-DD date');
            }
            return value;
        case 'select': {
            const options = question.options ?? [];
            if (typeof value !== 'string' || !options.includes(value)) {
                throw wrongKind(question, 'one of its options');
            }
            return value;
        }
    }
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
    if (!CALENDAR_DATE.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function wrongKind(question: CustomQuestion, expected: string): _LocalApiError {
    return new _LocalApiError('VALIDATION', `custom question '${question.key}' expects ${expected}`);
}

function missingAnswer(question: CustomQuestion): _LocalApiError {
    return new _LocalApiError('CUSTOM_QUESTION_REQUIRED', `'${question.key}' is required`);
}

function gapIn(question: CustomQuestion, value: unknown): QuestionnaireGapReason | null {
    if (isBlank(value)) return 'unanswered';
    try {
        coerce(question, value);
        return null;
    } catch {
        return 'answer_no_longer_valid';
    }
}

function auditAnswers(stored: Answers): QuestionnaireGap[] {
    const gaps: QuestionnaireGap[] = [];
    for (const question of activeQuestions()) {
        const reason = gapIn(question, stored[question.key]);
        if (!reason) continue;
        gaps.push({
            key: question.key,
            label: question.label,
            required: question.required,
            reason,
        });
    }
    return gaps;
}

function sorted(questions: CustomQuestion[]): CustomQuestion[] {
    return [...questions].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function activeQuestions(): CustomQuestion[] {
    return sorted(store.questions.filter((q) => q.active));
}

export const _LocalPatientsApi = {
    async listQuestions(): Promise<CustomQuestion[]> {
        await wait(READ_MS);
        return activeQuestions().map((q) => ({ ...q }));
    },

    async search(q: string, limit = 25): Promise<Patient[]> {
        await wait(READ_MS);
        const term = q.trim();
        if (term === FAIL) throw new _LocalApiError('INTERNAL', 'the clinic server did not answer');

        const byNewest = [...store.patients].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (!term) return byNewest.slice(0, limit).map(clone);

        const needle = term.toLowerCase();
        const digits = term.replace(/\D/g, '');

        return byNewest
            .filter(
                (p) =>
                    p.name.toLowerCase().includes(needle) ||
                    (digits.length > 0 && p.phone.replace(/\D/g, '').includes(digits)),
            )
            .slice(0, limit)
            .map(clone);
    },

    async byId(id: string): Promise<PatientDetail> {
        await wait(READ_MS);
        const patient = require_(id);
        return {
            patient: clone(patient),
            visits: VISITS.filter((v) => v.patientId === id).map(({ patientId: _p, ...v }) => v),
            questionnaireGaps: auditAnswers(patient.custom),
        };
    },

    async outstanding(): Promise<PatientBalance[]> {
        await wait(READ_MS);
        const totals = new Map<string, number>();
        for (const v of VISITS) {
            if (v.balance <= 0) continue;
            totals.set(v.patientId, (totals.get(v.patientId) ?? 0) + v.balance);
        }
        return [...totals].map(([patientId, balance]) => ({ patientId, balance }));
    },

    async update(input: UpdatePatientInput): Promise<Patient> {
        await wait(WRITE_MS);
        const current = require_(input.id);
        if (!input.custom) return clone(current);

        const byKey = new Map(store.questions.map((q) => [q.key, q]));
        const next: Answers = { ...current.custom };

        for (const [key, value] of Object.entries(input.custom)) {
            const question = byKey.get(key);
            if (!question) {
                throw new _LocalApiError('VALIDATION', `no custom question has the key '${key}'`);
            }
            if (typeof value === 'string' && value.includes(FAIL)) {
                throw new _LocalApiError('INTERNAL', 'the clinic server did not answer');
            }
            if (isBlank(value)) {
                if (question.active && question.required) throw missingAnswer(question);
                delete next[key];
                continue;
            }
            next[key] = coerce(question, value);
        }

        current.custom = next;
        return clone(current);
    },
};
