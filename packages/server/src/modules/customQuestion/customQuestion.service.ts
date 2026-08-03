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
 * `validateAnswers` is the reason this module is a dependency of `patient`: a
 * required question that is never enforced is a form the clinic thinks it has.
 */

export type CustomQuestion = typeof customQuestions.$inferSelect;

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

    /**
     * Validates a patient's answers against the active questions and returns
     * the object to store. Answers to unknown or inactive keys are kept as they
     * are: a question deactivated after the fact must not silently erase what
     * patients already answered.
     */
    async validateAnswers(answers: Record<string, unknown>): Promise<Record<string, unknown>> {
        const questions = await this.list();
        const result: Record<string, unknown> = { ...answers };

        for (const question of questions) {
            const value = answers[question.key];
            const missing = value === undefined || value === null || value === '';

            if (missing) {
                if (question.required) {
                    throw new AppError(
                        ERROR_CODE.CUSTOM_QUESTION_REQUIRED,
                        `custom question '${question.key}' is required`,
                        422,
                    );
                }
                delete result[question.key];
                continue;
            }

            result[question.key] = coerce(question, value);
        }

        return result;
    },
};

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
