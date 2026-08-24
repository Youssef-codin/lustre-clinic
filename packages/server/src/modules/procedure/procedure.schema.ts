/**
 * SPEC §5, §12. Prices are integer piastres — never floats. A null `parentId`
 * makes a row a category root (one level of nesting only); `isToothSpecific`
 * means lines for the procedure must name a tooth, and others must not.
 */
import { MAX_AMOUNT_PIASTRES } from '@lustre/shared';
import { z } from 'zod';

const price = z.number().int().min(0).max(MAX_AMOUNT_PIASTRES);

export const createProcedureInput = z.object({
    parentId: z.uuid().nullish(),
    name: z.string().trim().min(1).max(160),
    defaultPrice: price,
    hasQuantity: z.boolean().default(false),
    isToothSpecific: z.boolean().default(false),
    isCheckup: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const updateProcedureInput = z.object({
    id: z.uuid(),
    parentId: z.uuid().nullish(),
    name: z.string().trim().min(1).max(160).optional(),
    defaultPrice: price.optional(),
    hasQuantity: z.boolean().optional(),
    isToothSpecific: z.boolean().optional(),
    isCheckup: z.boolean().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const procedureTreeInput = z
    .object({
        includeInactive: z.boolean().default(false),
    })
    .default({ includeInactive: false });

/**
 * The whole new order of one group of siblings, applied as one write. A row's
 * position is its index, so a half-applied list cannot exist — see
 * `procedureService.reorder`.
 */
export const reorderProceduresInput = z.object({
    ids: z.array(z.uuid()).min(1).max(500),
});

export type CreateProcedureInput = z.infer<typeof createProcedureInput>;
export type UpdateProcedureInput = z.infer<typeof updateProcedureInput>;
export type ProcedureTreeInput = z.infer<typeof procedureTreeInput>;
export type ReorderProceduresInput = z.infer<typeof reorderProceduresInput>;
