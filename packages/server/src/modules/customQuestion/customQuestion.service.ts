import { ERROR_CODE } from '@mawid/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { customQuestions } from '../../db/schema.ts';
import { AppError, PG_ERROR, pgErrorCode } from '../../errors/AppError.ts';
import type {
    CreateCustomQuestionInput,
    ListCustomQuestionInput,
    UpdateCustomQuestionInput,
} from './customQuestion.schema.ts';

/**
 * SPEC §5, §12. The clinic defines its own intake questions; answers live in
 * `patients.custom`, keyed by `key`.
 *
 * Validating those answers is the reason this module is a dependency of
 * `patient`, and it has two entry points because a questionnaire is edited over
 * years while the records filled in against it are kept forever:
 *
 * - `validateIntake` is the whole form, answered in one sitting. Every active
 *   required question must come back with an answer — a required question that
 *   is never enforced is a form the clinic only thinks it has.
 * - `validatePatch` is an edit to one existing record. Only the keys the caller
 *   actually sent are checked; everything already stored passes through exactly
 *   as it is.
 *
 * The asymmetry is the whole point. If a patient picked a `select` option in
 * 2024 and the doctor removed that option in 2026, correcting that patient's
 * phone number must not fail on an answer nobody touched.
 */

export type CustomQuestion = typeof customQuestions.$inferSelect;

/** Answers keyed by `custom_questions.key`, as stored in `patients.custom`. */
export type Answers = Record<string, unknown>;

/**
 * Why one patient's questionnaire wants the clinic's attention.
 *
 * `unanswered` — the question is asked today and this record has no answer to
 * it. Every patient on the books the day a question is added is unanswered.
 *
 * `answer_no_longer_valid` — there is an answer, but the question would not
 * accept it now. In practice this is a `select` whose option was removed.
 */
export type QuestionnaireGapReason = 'unanswered' | 'answer_no_longer_valid';

export interface QuestionnaireGap {
    key: string;
    /** Carried so the records screen does not have to join `customQuestion.list`. */
    label: string;
    required: boolean;
    reason: QuestionnaireGapReason;
}

/** What a `select` question stores in its `options` JSONB column. */
function optionsOf(question: CustomQuestion): string[] {
    return Array.isArray(question.options) ? (question.options as string[]) : [];
}

export const customQuestionService = {
    async list(input: ListCustomQuestionInput = { includeInactive: false }): Promise<CustomQuestion[]> {
        const rows = await db
            .select()
            .from(customQuestions)
            .orderBy(asc(customQuestions.sortOrder), asc(customQuestions.label));

        return input.includeInactive ? rows : rows.filter((q) => q.active);
    },

    async create(input: CreateCustomQuestionInput): Promise<CustomQuestion> {
        try {
            const [row] = await db
                .insert(customQuestions)
                .values({
                    id: Bun.randomUUIDv7(),
                    key: input.key,
                    label: input.label,
                    kind: input.kind,
                    options: input.kind === 'select' ? (input.options ?? []) : null,
                    required: input.required,
                    sortOrder: input.sortOrder,
                })
                .returning();

            if (!row) throw AppError.internal('custom question insert returned nothing');
            return row;
        } catch (err) {
            if (pgErrorCode(err) === PG_ERROR.UNIQUE_VIOLATION) {
                throw new AppError(ERROR_CODE.DUPLICATE_KEY, 'that question key is already in use', 409, {
                    cause: err,
                });
            }
            throw err;
        }
    },

    async update({ id, ...patch }: UpdateCustomQuestionInput): Promise<CustomQuestion> {
        const [row] = await db
            .update(customQuestions)
            .set(patch)
            .where(eq(customQuestions.id, id))
            .returning();

        if (!row) throw AppError.notFound('custom question');
        return row;
    },

    /** Every question, active or not, indexed by the key answers are stored under. */
    async byKey(): Promise<Map<string, CustomQuestion>> {
        const rows = await this.list({ includeInactive: true });
        return new Map(rows.map((question) => [question.key, question]));
    },

    /**
     * The complete questionnaire, filled in as one form. Returns the object to
     * store in `patients.custom`.
     */
    async validateIntake(answers: Answers): Promise<Answers> {
        const questions = await this.byKey();
        const result = checkSubmitted(answers, questions);

        for (const question of questions.values()) {
            const answered = question.key in result;
            if (question.active && question.required && !answered) throw missingAnswer(question);
        }

        return result;
    },

    /**
     * An edit to one patient's answers. Returns the object to store: `stored`
     * with the submitted keys applied over it.
     *
     * Questions the caller said nothing about are not looked at, whatever the
     * questionnaire says about them today. That is what lets a record outlive
     * the form it was filled in on — a question added, deactivated, made
     * required, or narrowed since never blocks an unrelated edit. Use
     * `auditAnswers` to find what such a record is now missing.
     */
    async validatePatch(stored: Answers, patch: Answers): Promise<Answers> {
        const questions = await this.byKey();
        const edits = checkSubmitted(patch, questions);
        const result: Answers = { ...stored };

        for (const key of Object.keys(patch)) {
            // A key that survived `checkSubmitted` without landing in `edits`
            // was submitted blank, which means the caller cleared the answer.
            if (key in edits) result[key] = edits[key];
            else delete result[key];
        }

        return result;
    },

    /**
     * What one patient's stored answers are missing or no longer say, measured
     * against the questionnaire as it stands today.
     *
     * `validatePatch` deliberately lets a record fall behind the form rather
     * than block an edit on it, so the gap has to show up somewhere the clinic
     * will see it. This is that somewhere: the records screen reads it off
     * `patient.byId` and asks the questions the patient never got.
     *
     * Ordered by the questionnaire's own `sortOrder`, so the prompts come in
     * the order the form asks them.
     */
    async auditAnswers(stored: Answers): Promise<QuestionnaireGap[]> {
        // Active only — a deactivated question is no longer asked, so a patient
        // who never answered it is not behind on anything.
        const questions = await this.list();
        const gaps: QuestionnaireGap[] = [];

        for (const question of questions) {
            const value = stored[question.key];
            const reason = gapIn(question, value);
            if (!reason) continue;

            gaps.push({
                key: question.key,
                label: question.label,
                required: question.required,
                reason,
            });
        }

        return gaps;
    },
};

/** The reason this answer needs attention, or null if it is fine as it stands. */
function gapIn(question: CustomQuestion, value: unknown): QuestionnaireGapReason | null {
    if (isBlank(value)) return 'unanswered';

    try {
        // `coerce` is the one definition of an acceptable answer, and it reports
        // by throwing. Borrowing it here beats a second copy that can drift.
        coerce(question, value);
        return null;
    } catch {
        return 'answer_no_longer_valid';
    }
}

/**
 * The answers the caller actually sent, each checked against its own question.
 * A blank answer is dropped rather than stored, and a key with no question
 * behind it is refused: nothing would ever validate it again, so a typo would
 * sit in the patient's record for good.
 */
function checkSubmitted(submitted: Answers, questions: Map<string, CustomQuestion>): Answers {
    const result: Answers = {};

    for (const [key, value] of Object.entries(submitted)) {
        const question = questions.get(key);
        if (!question) {
            throw new AppError(ERROR_CODE.VALIDATION, `no custom question has the key '${key}'`, 422);
        }

        if (isBlank(value)) {
            if (question.active && question.required) throw missingAnswer(question);
            continue;
        }

        result[key] = coerce(question, value);
    }

    return result;
}

/** What counts as "not answered", for a form where every field is optional to send. */
function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

/** One answer, checked against its question's kind. */
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

        case 'select': {
            const options = optionsOf(question);
            if (typeof value !== 'string' || !options.includes(value)) {
                throw wrongKind(question, 'one of its options');
            }
            return value;
        }
    }
}

function wrongKind(question: CustomQuestion, expected: string): AppError {
    // The message names the key, never the answer — answers are patient data.
    return new AppError(ERROR_CODE.VALIDATION, `custom question '${question.key}' expects ${expected}`, 422);
}

function missingAnswer(question: CustomQuestion): AppError {
    return new AppError(
        ERROR_CODE.CUSTOM_QUESTION_REQUIRED,
        `custom question '${question.key}' is required`,
        422,
    );
}
