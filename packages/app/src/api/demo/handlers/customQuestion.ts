/**
 * `server/src/modules/customQuestion/customQuestion.service.ts`. The answer
 * rules — intake, patch and audit, and the asymmetry between the first two — are
 * `answerRules` in `@lustre/shared`, the same code the server runs.
 */
import { answerRules, ERROR_CODE } from '@lustre/shared';
import type { RouterInput, RouterOutput } from '../../types';
import { type CustomQuestionRow, getDb, save } from '../db';
import { assignDefined, DemoError, demoFail, uuidv7 } from '../rules';
import type { Dated } from '../wire';

type CustomQuestion = Dated<RouterOutput['customQuestion']['list'][number]>;
export type Answers = Record<string, unknown>;
type QuestionnaireGap = Dated<RouterOutput['patient']['byId']['questionnaireGaps'][number]>;

const rules = answerRules(demoFail);

function sorted(rows: readonly CustomQuestionRow[]): CustomQuestionRow[] {
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function byKey(): Map<string, CustomQuestionRow> {
    return new Map(getDb().customQuestions.map((question) => [question.key, question]));
}

export const customQuestionHandlers = {
    list(input: RouterInput['customQuestion']['list']): CustomQuestion[] {
        const rows = sorted(getDb().customQuestions);
        return input?.includeInactive ? rows : rows.filter((row) => row.active);
    },

    create(input: RouterInput['customQuestion']['create']): CustomQuestion {
        if (getDb().customQuestions.some((question) => question.key === input.key)) {
            throw new DemoError(ERROR_CODE.DUPLICATE_KEY, 'that question key is already in use', 409);
        }

        const row: CustomQuestionRow = {
            id: uuidv7(),
            key: input.key,
            label: input.label,
            labelAr: input.labelAr ?? null,
            kind: input.kind,
            options: input.kind === 'select' ? (input.options ?? []) : null,
            required: input.required ?? false,
            sortOrder: input.sortOrder ?? 0,
            active: true,
        };

        getDb().customQuestions.push(row);
        save();
        return row;
    },

    update(input: RouterInput['customQuestion']['update']): CustomQuestion {
        const { id, ...patch } = input;
        const row = getDb().customQuestions.find((question) => question.id === id);
        if (!row) throw DemoError.notFound('custom question');

        assignDefined(row, patch);
        save();
        return row;
    },

    reorder(input: RouterInput['customQuestion']['reorder']): void {
        const { ids } = input;

        if (new Set(ids).size !== ids.length) {
            throw new DemoError(ERROR_CODE.VALIDATION, 'the same question appears twice in the order', 422);
        }

        const rows = ids.map((id) => {
            const row = getDb().customQuestions.find((question) => question.id === id);
            if (!row) throw DemoError.notFound('custom question');
            return row;
        });

        for (const [index, row] of rows.entries()) row.sortOrder = index;
        save();
    },

    validateIntake(answers: Answers): Answers {
        return rules.intake(answers, byKey());
    },

    validatePatch(stored: Answers, patch: Answers): Answers {
        return rules.patch(stored, patch, byKey());
    },

    auditAnswers(stored: Answers): QuestionnaireGap[] {
        // The rows, not `list`'s answer: `options` is a `jsonb` column, so the
        // wire type makes it optional and the rules need the row's own.
        return rules.audit(
            stored,
            sorted(getDb().customQuestions).filter((row) => row.active),
        );
    },
};
