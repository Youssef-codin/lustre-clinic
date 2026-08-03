import { ERROR_CODE } from '@mawid/shared';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { procedureTypes } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import type { CreateProcedureInput, ProcedureTreeInput, UpdateProcedureInput } from './procedure.schema.ts';

/**
 * SPEC §5, §12. The hierarchy is one level deep. A row with children is a
 * category and is not selectable; only leaves are. Both rules are enforced
 * here, in the service layer, because the schema cannot express them.
 */

export type Procedure = typeof procedureTypes.$inferSelect;

export interface ProcedureNode extends Procedure {
    children: Procedure[];
    /** A row with no children. Only these may go on a visit (§5). */
    selectable: boolean;
}

async function requireRow(id: string): Promise<Procedure> {
    const [row] = await db.select().from(procedureTypes).where(eq(procedureTypes.id, id)).limit(1);
    if (!row) throw AppError.notFound('procedure');
    return row;
}

async function hasChildren(id: string): Promise<boolean> {
    const [child] = await db
        .select({ id: procedureTypes.id })
        .from(procedureTypes)
        .where(eq(procedureTypes.parentId, id))
        .limit(1);
    return child !== undefined;
}

/** A parent must itself be a root, or the tree would be three levels deep. */
async function assertUsableAsParent(parentId: string): Promise<void> {
    const parent = await requireRow(parentId);
    if (parent.parentId !== null) {
        throw new AppError(ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP, 'a subtype may not have children', 422);
    }
}

export const procedureService = {
    /** Categories with their leaves nested; childless roots come back as leaves. */
    async tree(input: ProcedureTreeInput = { includeInactive: false }): Promise<ProcedureNode[]> {
        const rows = await db
            .select()
            .from(procedureTypes)
            .orderBy(asc(procedureTypes.sortOrder), asc(procedureTypes.name));

        const visible = input.includeInactive ? rows : rows.filter((r) => r.active);

        const childrenByParent = new Map<string, Procedure[]>();
        for (const row of visible) {
            if (!row.parentId) continue;
            const siblings = childrenByParent.get(row.parentId) ?? [];
            siblings.push(row);
            childrenByParent.set(row.parentId, siblings);
        }

        return visible
            .filter((row) => row.parentId === null)
            .map((root) => {
                const children = childrenByParent.get(root.id) ?? [];
                return { ...root, children, selectable: children.length === 0 };
            });
    },

    async byId(id: string): Promise<Procedure> {
        return requireRow(id);
    },

    /**
     * Used by the visit module before a procedure goes on a visit. A category
     * row is a heading, not something that can be charged for.
     */
    async requireSelectable(id: string): Promise<Procedure> {
        const row = await requireRow(id);
        if (await hasChildren(row.id)) {
            throw new AppError(ERROR_CODE.PROCEDURE_NOT_SELECTABLE, 'that procedure is a category', 422);
        }
        return row;
    },

    /** §8 — the line seeded on check-in. Null when the clinic has not set one. */
    async findCheckup(): Promise<Procedure | null> {
        const [row] = await db
            .select()
            .from(procedureTypes)
            .where(and(eq(procedureTypes.isCheckup, true), eq(procedureTypes.active, true)))
            .orderBy(asc(procedureTypes.sortOrder), asc(procedureTypes.name))
            .limit(1);
        return row ?? null;
    },

    async create(input: CreateProcedureInput): Promise<Procedure> {
        if (input.parentId) await assertUsableAsParent(input.parentId);

        const [row] = await db
            .insert(procedureTypes)
            .values({
                id: Bun.randomUUIDv7(),
                parentId: input.parentId ?? null,
                name: input.name,
                defaultPrice: input.defaultPrice,
                hasQuantity: input.hasQuantity,
                isCheckup: input.isCheckup,
                sortOrder: input.sortOrder,
            })
            .returning();

        if (!row) throw AppError.internal('procedure insert returned nothing');
        return row;
    },

    async update({ id, ...patch }: UpdateProcedureInput): Promise<Procedure> {
        const current = await requireRow(id);

        if (patch.parentId !== undefined && patch.parentId !== null) {
            if (patch.parentId === id) {
                throw new AppError(
                    ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP,
                    'a procedure cannot be its own parent',
                    422,
                );
            }
            await assertUsableAsParent(patch.parentId);

            // Moving a category under another would nest three levels deep.
            if (await hasChildren(id)) {
                throw new AppError(
                    ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP,
                    'a category with children cannot become a subtype',
                    422,
                );
            }
        }

        const [row] = await db
            .update(procedureTypes)
            .set({ ...patch, parentId: patch.parentId === undefined ? current.parentId : patch.parentId })
            .where(eq(procedureTypes.id, id))
            .returning();

        if (!row) throw AppError.notFound('procedure');
        return row;
    },

    /** Leaves only, for pickers that do not want the tree shape. */
    async selectableList(): Promise<Procedure[]> {
        const rows = await db
            .select()
            .from(procedureTypes)
            .orderBy(asc(procedureTypes.sortOrder), asc(procedureTypes.name));

        // Parenthood is computed over every row, active or not: deactivating a
        // subtype must not make its category look selectable.
        const parents = new Set(rows.map((r) => r.parentId).filter((id): id is string => id !== null));
        return rows.filter((row) => row.active && !parents.has(row.id));
    },
};
