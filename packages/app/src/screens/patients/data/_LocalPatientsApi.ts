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

/**
 * `_Local` per §10: this stands in for the tRPC client, which does not exist
 * yet (SPEC §18 F2 has not landed and `@trpc/client` is not an app dependency).
 * Adding one would mean editing `packages/app/package.json` and the lockfile in
 * four worktrees at once, which is exactly what §10 exists to prevent. Noted in
 * `BLOCKED.md`.
 *
 * It is not a stub that returns a constant. It is the four procedures this
 * cluster calls — `patient.search`, `patient.byId`, `patient.update`,
 * `customQuestion.list`, `balance.outstanding` — over the fixtures, with the
 * server's own answer validation and gap audit reimplemented from
 * `customQuestion.service.ts`. The screens therefore meet the real failure
 * modes: a required answer refused, a stored answer today's questionnaire would
 * no longer accept, a patch that must not drop the keys it left out.
 *
 * Swapping it for the real client is replacing the five function bodies.
 */

/* --------------------------------------------------------------- transport */

/**
 * Every call crosses Tailscale to a PC in the clinic, and the gap between the
 * tap and the answer is what loading and pending states are for. Writes are
 * slower than reads on purpose: that is where a second tap books a second
 * appointment (`ui/README.md`).
 */
const READ_MS = 320;
const WRITE_MS = 700;

/**
 * How to see the failure states on a device without editing code: search for
 * `!fail`, or save an answer containing `!fail`. Both are checked before
 * anything else and are the only magic strings in the cluster.
 */
const FAIL = '!fail';

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * What the screens catch. The real client throws a `TRPCClientError` carrying
 * `shape.data.appCode` (SPEC §4), which is what `code` becomes — the UI
 * switches on the code and never parses the message.
 */
export class _LocalApiError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = '_LocalApiError';
        this.code = code;
    }
}

/* ---------------------------------------------------------------- the store */

// Mutable so an edit survives navigating away and back, the way the server's
// row would. Cloned on the way out so no screen can hold a reference into it.
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

/* ---------------------------------------------- answers, per the server's rules */

/** `customQuestion.service.ts` — what counts as "not answered". */
function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

/** One answer checked against its question's kind. Throws exactly as the server does. */
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
    // Names the key, never the answer — answers are patient data (SPEC §4).
    return new _LocalApiError('VALIDATION', `custom question '${question.key}' expects ${expected}`);
}

function missingAnswer(question: CustomQuestion): _LocalApiError {
    return new _LocalApiError('CUSTOM_QUESTION_REQUIRED', `'${question.key}' is required`);
}

/** Why this answer wants the clinic's attention, or null if it is fine. */
function gapIn(question: CustomQuestion, value: unknown): QuestionnaireGapReason | null {
    if (isBlank(value)) return 'unanswered';
    try {
        coerce(question, value);
        return null;
    } catch {
        return 'answer_no_longer_valid';
    }
}

/** `auditAnswers` — active questions only, in the questionnaire's own order. */
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

/* -------------------------------------------------------------- procedures */

export const _LocalPatientsApi = {
    /** `customQuestion.list` — active only, which is what a record renders. */
    async listQuestions(): Promise<CustomQuestion[]> {
        await wait(READ_MS);
        return activeQuestions().map((q) => ({ ...q }));
    },

    /**
     * `patient.search`. Name or phone, substring, newest first — the same
     * `ILIKE` behaviour the service documents. An empty term returns the
     * recent list rather than nothing, which is what the design draws.
     */
    async search(q: string, limit = 25): Promise<Patient[]> {
        await wait(READ_MS);
        const term = q.trim();
        if (term === FAIL) throw new _LocalApiError('INTERNAL', 'the clinic server did not answer');

        const byNewest = [...store.patients].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (!term) return byNewest.slice(0, limit).map(clone);

        const needle = term.toLowerCase();
        // Digits only, so '0100' finds '+201001234567' the way the server's
        // normalize-then-match does without a phone parser on the client.
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

    /** `patient.byId` — patient, visits and questionnaire gaps in one payload (§13). */
    async byId(id: string): Promise<PatientDetail> {
        await wait(READ_MS);
        const patient = require_(id);
        return {
            patient: clone(patient),
            visits: VISITS.filter((v) => v.patientId === id).map(({ patientId: _p, ...v }) => v),
            questionnaireGaps: auditAnswers(patient.custom),
        };
    },

    /** `balance.outstanding`, narrowed to the per-patient totals the list draws. */
    async outstanding(): Promise<PatientBalance[]> {
        await wait(READ_MS);
        const totals = new Map<string, number>();
        for (const v of VISITS) {
            if (v.balance <= 0) continue;
            totals.set(v.patientId, (totals.get(v.patientId) ?? 0) + v.balance);
        }
        return [...totals].map(([patientId, balance]) => ({ patientId, balance }));
    },

    /**
     * `patient.update`, with the service's patch semantics: only the keys sent
     * are validated, a key sent blank clears that answer, and everything else
     * stored is left exactly as it is — including answers to questions that
     * have since been deactivated (§7.8).
     */
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
