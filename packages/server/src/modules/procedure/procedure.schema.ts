/**
 * SPEC §5, §12. Prices are integer piastres — never floats. A null `parentId`
 * makes a row a category root (one level of nesting only); `isToothSpecific`
 * means lines for the procedure must name a tooth, and others must not.
 */
import { MAX_AMOUNT_PIASTRES, MAX_PROCEDURE_NAME, TEETH } from '@lustre/shared';
import { z } from 'zod';

const price = z.number().int().min(0).max(MAX_AMOUNT_PIASTRES);

export const createProcedureInput = z.object({
    parentId: z.uuid().nullish(),
    name: z.string().trim().min(1).max(MAX_PROCEDURE_NAME),
    defaultPrice: price,
    hasQuantity: z.boolean().default(false),
    isToothSpecific: z.boolean().default(false),
    isCheckup: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const updateProcedureInput = z.object({
    id: z.uuid(),
    parentId: z.uuid().nullish(),
    name: z.string().trim().min(1).max(MAX_PROCEDURE_NAME).optional(),
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
 * A category and the first subtype under it, written together. A category is a
 * row something else names as a parent, so one with nothing under it is just a
 * root with a price and `list` would offer it on a visit — the pair is the unit
 * that makes sense, and `procedureService.createCategory` writes it as one.
 */
export const createCategoryInput = z.object({
    name: z.string().trim().min(1).max(MAX_PROCEDURE_NAME),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    first: z.object({
        name: z.string().trim().min(1).max(MAX_PROCEDURE_NAME),
        defaultPrice: price,
        hasQuantity: z.boolean().default(false),
        isToothSpecific: z.boolean().default(false),
        isCheckup: z.boolean().default(false),
    }),
});

/**
 * The whole new order of one group of siblings, applied as one write. A row's
 * position is its index, so a half-applied list cannot exist — see
 * `procedureService.reorder`.
 */
export const reorderProceduresInput = z.object({
    ids: z.array(z.uuid()).min(1).max(500),
});

export type CreateProcedureInput = z.infer<typeof createProcedureInput>;
export type CreateCategoryInput = z.infer<typeof createCategoryInput>;
export type UpdateProcedureInput = z.infer<typeof updateProcedureInput>;
export type ProcedureTreeInput = z.infer<typeof procedureTreeInput>;
export type ReorderProceduresInput = z.infer<typeof reorderProceduresInput>;

/**
 * Work a patient had done before this system knew about it, added from their
 * record rather than at registration. One line is a procedure and the day it
 * was done, and the day is optional for the same reason it is optional on the
 * registration block: the paper file says what was done and not always when.
 *
 * The shape is `oldProcedureInput`'s minus the registration context, and it is
 * spelled out here rather than imported from `patient.schema` so the procedure
 * module owns its own input. The *rules* are not duplicated — the write goes
 * through `migration.service`, which is what keeps the two paths from drifting.
 *
 * No `offsetMinutes` rides with `performedOn`. These rows label a day rather
 * than bound one, and are stamped at noon UTC; see `migration.service`.
 */
const historicalProcedureLine = z.object({
    procedureId: z.uuid(),
    quantity: z.number().int().min(1).max(999).default(1),
    tooth: z.enum(TEETH).nullish(),
    /** `YYYY-MM-DD`, or absent — absent is *before migration*, not a missing answer. */
    performedOn: z.iso.date().nullish(),
});

/** One trip to the record adds one file's worth. Past that it is a paste, not a history. */
const MAX_HISTORICAL_PROCEDURES = 50;

export const addHistoricalProceduresInput = z.object({
    patientId: z.uuid(),
    procedures: z.array(historicalProcedureLine).min(1).max(MAX_HISTORICAL_PROCEDURES),
});

export type AddHistoricalProceduresInput = z.infer<typeof addHistoricalProceduresInput>;
