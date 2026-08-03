import { MAX_AMOUNT_PIASTRES } from '@mawid/shared';
import { z } from 'zod';

/** SPEC §5, §12. Prices are integer piastres — never floats. */

const price = z.number().int().min(0).max(MAX_AMOUNT_PIASTRES);

export const createProcedureInput = z.object({
    /** Null makes this a category root. One level of nesting only (§5). */
    parentId: z.uuid().nullish(),
    name: z.string().trim().min(1).max(160),
    defaultPrice: price,
    hasQuantity: z.boolean().default(false),
    isCheckup: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const updateProcedureInput = z.object({
    id: z.uuid(),
    parentId: z.uuid().nullish(),
    name: z.string().trim().min(1).max(160).optional(),
    defaultPrice: price.optional(),
    hasQuantity: z.boolean().optional(),
    isCheckup: z.boolean().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const procedureTreeInput = z
    .object({
        includeInactive: z.boolean().default(false),
    })
    .default({ includeInactive: false });

export type CreateProcedureInput = z.infer<typeof createProcedureInput>;
export type UpdateProcedureInput = z.infer<typeof updateProcedureInput>;
export type ProcedureTreeInput = z.infer<typeof procedureTreeInput>;
