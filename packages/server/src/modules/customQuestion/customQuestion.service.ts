/**
 * SPEC §5, §12. The clinic defines its own intake questions; answers live in
 * `patients.custom`, keyed by `key`.
 *
 * Validating those answers is the reason this module is a dependency of
 * `patient`. The rules — `validateIntake` enforcing every active required
 * question, `validatePatch` checking only the keys it was sent, and the audit —
 * are `answerRules` in `@lustre/shared`, because the demo backend applies them
 * too. What stays here is reading the questions out of Postgres.
 */
import { type Answers, answerRules, ERROR_CODE, type QuestionnaireGap } from '@lustre/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { customQuestions } from '../../db/schema.ts';
import { AppError, PG_ERROR, pgErrorCode } from '../../errors/AppError.ts';
import type {
    CreateCustomQuestionInput,
    ListCustomQuestionInput,
    ReorderCustomQuestionsInput,
    UpdateCustomQuestionInput,
} from './customQuestion.schema.ts';

export type { Answers, QuestionnaireGap, QuestionnaireGapReason } from '@lustre/shared';

type CustomQuestion = typeof customQuestions.$inferSelect;

const rules = answerRules((code, message, status) => new AppError(code, message, status));

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
                    labelAr: input.labelAr ?? null,
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
     * The whole order of the questionnaire, in one transaction. The client
     * sends the list it wants and every row is stamped with its index, so a
     * connection that drops mid-write leaves the previous order intact rather
     * than half of each.
     */
    async reorder({ ids }: ReorderCustomQuestionsInput): Promise<void> {
        if (new Set(ids).size !== ids.length) {
            throw new AppError(ERROR_CODE.VALIDATION, 'the same question appears twice in the order', 422);
        }

        await db.transaction(async (tx) => {
            const rows = await tx
                .select({ id: customQuestions.id })
                .from(customQuestions)
                .where(inArray(customQuestions.id, ids));

            if (rows.length !== ids.length) throw AppError.notFound('custom question');

            for (const [index, id] of ids.entries()) {
                await tx.update(customQuestions).set({ sortOrder: index }).where(eq(customQuestions.id, id));
            }
        });
    },

    async byKey(): Promise<Map<string, CustomQuestion>> {
        const rows = await this.list({ includeInactive: true });
        return new Map(rows.map((question) => [question.key, question]));
    },

    async validateIntake(answers: Answers): Promise<Answers> {
        return rules.intake(answers, await this.byKey());
    },

    async validatePatch(stored: Answers, patch: Answers): Promise<Answers> {
        return rules.patch(stored, patch, await this.byKey());
    },

    async auditAnswers(stored: Answers): Promise<QuestionnaireGap[]> {
        return rules.audit(stored, await this.list());
    },
};
