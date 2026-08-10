import type { QuestionKind } from '@mawid/shared';

/**
 * The shapes the settings screens read and write.
 *
 * These are hand-written, which the conventions forbid — request and response
 * types come from the inferred `AppRouter`. They are hand-written anyway because
 * `packages/app` has no tRPC client yet (F2 in SPEC §18 has not landed), so
 * there is nothing to infer from. Each one mirrors a server service return type
 * field for field, so swapping `_LocalApi` for the real client is a change of
 * import and nothing else:
 *
 * | here              | server                                          |
 * | ----------------- | ----------------------------------------------- |
 * | `Branch`          | `branch.service.ts` `Branch`                    |
 * | `Procedure`       | `procedure.service.ts` `Procedure`              |
 * | `ProcedureNode`   | `procedure.service.ts` `ProcedureNode`          |
 * | `CustomQuestion`  | `customQuestion.service.ts` `CustomQuestion`    |
 * | `ClinicDay`       | `settings.service.ts` `ClinicDay`               |
 *
 * See BLOCKED.md.
 */

export interface Branch {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
}

/** Money is integer piastres (SPEC §9). `defaultPrice` is never a float. */
export interface Procedure {
    id: string;
    /** Null makes this a category root. One level of nesting only (§5). */
    parentId: string | null;
    name: string;
    defaultPrice: number;
    hasQuantity: boolean;
    isToothSpecific: boolean;
    isCheckup: boolean;
    active: boolean;
    sortOrder: number;
}

/** A category with its leaves nested. A childless root comes back selectable. */
export interface ProcedureNode extends Procedure {
    children: Procedure[];
    /** A row with no children. Only these may go on a visit (§5). */
    selectable: boolean;
}

export interface CustomQuestion {
    id: string;
    /** The stable key into `patients.custom`. Never editable once answers exist. */
    key: string;
    label: string;
    kind: QuestionKind;
    /** Only meaningful for `select`. */
    options: string[] | null;
    required: boolean;
    sortOrder: number;
    active: boolean;
}

/** MAW-1. A weekday with no row is closed — that is the whole encoding. */
export interface ClinicDay {
    /** 0 = Sunday … 6 = Saturday, matching `Date#getDay`. */
    weekday: number;
    branchId: string;
    opensAt: string;
    closesAt: string;
}
