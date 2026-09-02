/**
 * SPEC §5, §12. `key` is the stable key into `patients.custom`, so it is
 * constrained to something that stays readable in JSON and never changes once
 * answers exist against it — which is why `updateCustomQuestionInput` omits it.
 */
import { questionKindSchema } from '@lustre/shared';
import { z } from 'zod';

/**
 * The Arabic label is optional and empty means absent: the editor sends `''`
 * for an input nobody filled in, and storing that instead of NULL would make
 * `resolveLabel`'s fallback depend on which screen wrote the row.
 */
const labelAr = z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null)
    .nullish();

const key = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'key must be lower_snake_case');

export const createCustomQuestionInput = z
    .object({
        key,
        label: z.string().trim().min(1).max(200),
        labelAr,
        kind: questionKindSchema,
        options: z.array(z.string().trim().min(1).max(120)).min(1).max(50).nullish(),
        required: z.boolean().default(false),
        sortOrder: z.number().int().min(0).max(9999).default(0),
    })
    .refine((v) => v.kind !== 'select' || (v.options?.length ?? 0) > 0, {
        message: 'a select question needs options',
        path: ['options'],
    });

export const updateCustomQuestionInput = z.object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(200).optional(),
    labelAr,
    options: z.array(z.string().trim().min(1).max(120)).min(1).max(50).nullish(),
    required: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    active: z.boolean().optional(),
});

export const listCustomQuestionInput = z
    .object({
        includeInactive: z.boolean().default(false),
    })
    .default({ includeInactive: false });

/**
 * The whole new order, applied as one write. A question's position is its
 * index in the list — see `customQuestionService.reorder`.
 */
export const reorderCustomQuestionsInput = z.object({
    ids: z.array(z.uuid()).min(1).max(500),
});

export type CreateCustomQuestionInput = z.infer<typeof createCustomQuestionInput>;
export type UpdateCustomQuestionInput = z.infer<typeof updateCustomQuestionInput>;
export type ListCustomQuestionInput = z.infer<typeof listCustomQuestionInput>;
export type ReorderCustomQuestionsInput = z.infer<typeof reorderCustomQuestionsInput>;
