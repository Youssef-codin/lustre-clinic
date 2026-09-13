/**
 * SPEC §5, §12 — what counts as an answer to a clinic's own intake questions.
 * Run by `customQuestion.service.ts` on the server and by the demo backend over
 * its in-memory rows; each side fetches the questions its own way and hands them
 * in.
 *
 * Two entry points, because a questionnaire is edited over years while the
 * records filled in against it are kept forever:
 *
 * - `intake` is the whole form, answered in one sitting. Every active required
 *   question must come back with an answer.
 * - `patch` is an edit to one existing record. Only the keys the caller sent are
 *   checked; everything already stored passes through exactly as it is. If a
 *   patient picked a `select` option that has since been removed, correcting
 *   their phone number must not fail on an answer nobody touched.
 *
 * A submitted blank drops the answer (or clears it on patch), and a key with no
 * question behind it is refused — nothing would ever validate it again. `coerce`
 * is the single definition of an acceptable answer, shared by validation,
 * patching, and auditing. Error messages name the question key, never the
 * answer, which is patient data.
 */
import type { QUESTION_KINDS } from './enums.ts';
import { ERROR_CODE, type Fail } from './errors.ts';

export interface AnswerQuestion {
    key: string;
    label: string;
    labelAr: string | null;
    kind: (typeof QUESTION_KINDS)[number];
    options: unknown;
    required: boolean;
    active: boolean;
}

export type Answers = Record<string, unknown>;

export type QuestionnaireGapReason = 'unanswered' | 'answer_no_longer_valid';

export interface QuestionnaireGap {
    key: string;
    label: string;
    labelAr: string | null;
    required: boolean;
    reason: QuestionnaireGapReason;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
    if (!CALENDAR_DATE.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

function optionsOf(question: AnswerQuestion): string[] {
    return Array.isArray(question.options) ? (question.options as string[]) : [];
}

export function answerRules(fail: Fail) {
    function wrongKind(question: AnswerQuestion, expected: string): Error {
        return fail(ERROR_CODE.VALIDATION, `custom question '${question.key}' expects ${expected}`, 422);
    }

    function missingAnswer(question: AnswerQuestion): Error {
        return fail(
            ERROR_CODE.CUSTOM_QUESTION_REQUIRED,
            `custom question '${question.key}' is required`,
            422,
        );
    }

    function coerce(question: AnswerQuestion, value: unknown): unknown {
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
                if (typeof value !== 'string' || !optionsOf(question).includes(value)) {
                    throw wrongKind(question, 'one of its options');
                }
                return value;
            }
        }
    }

    function checkSubmitted(submitted: Answers, questions: ReadonlyMap<string, AnswerQuestion>): Answers {
        const result: Answers = {};

        for (const [key, value] of Object.entries(submitted)) {
            const question = questions.get(key);
            if (!question) {
                throw fail(ERROR_CODE.VALIDATION, `no custom question has the key '${key}'`, 422);
            }

            if (isBlank(value)) {
                if (question.active && question.required) throw missingAnswer(question);
                continue;
            }

            result[key] = coerce(question, value);
        }

        return result;
    }

    function gapIn(question: AnswerQuestion, value: unknown): QuestionnaireGapReason | null {
        if (isBlank(value)) return 'unanswered';

        try {
            coerce(question, value);
            return null;
        } catch {
            return 'answer_no_longer_valid';
        }
    }

    return {
        /** `questions` is every question, active or not, by key. */
        intake(answers: Answers, questions: ReadonlyMap<string, AnswerQuestion>): Answers {
            const result = checkSubmitted(answers, questions);

            for (const question of questions.values()) {
                // Own keys only: a question keyed `constructor` is not answered by `Object.prototype`.
                const answered = Object.hasOwn(result, question.key);
                if (question.active && question.required && !answered) throw missingAnswer(question);
            }

            return result;
        },

        /** `questions` is every question, active or not, by key. */
        patch(stored: Answers, patch: Answers, questions: ReadonlyMap<string, AnswerQuestion>): Answers {
            const edits = checkSubmitted(patch, questions);
            const result: Answers = { ...stored };

            for (const key of Object.keys(patch)) {
                if (Object.hasOwn(edits, key)) result[key] = edits[key];
                else delete result[key];
            }

            return result;
        },

        /** `questions` is the active questions, in the order the form draws them. */
        audit(stored: Answers, questions: readonly AnswerQuestion[]): QuestionnaireGap[] {
            const gaps: QuestionnaireGap[] = [];

            for (const question of questions) {
                const reason = gapIn(question, stored[question.key]);
                if (!reason) continue;

                gaps.push({
                    key: question.key,
                    label: question.label,
                    labelAr: question.labelAr,
                    required: question.required,
                    reason,
                });
            }

            return gaps;
        },
    };
}
