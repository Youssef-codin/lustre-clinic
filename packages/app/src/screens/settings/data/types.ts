/**
 * The shapes the settings screens read and write — hand-written mirrors of the
 * server's service return types, because there is no tRPC client to infer from
 * yet. Swapping `_LocalApi` for the real client is a change of import and
 * nothing else. Money is integer piastres; `parentId: null` makes a category
 * root, one level of nesting only, and only childless rows are selectable;
 * `key` is stable and never editable once answers exist; `options` is `unknown`
 * because the column is `jsonb` (read via `optionsOf`); a weekday with no row
 * is closed, `0` = Sunday.
 */
import type { QuestionKind } from '@lustre/shared';

export interface Branch {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
}

export interface Procedure {
    id: string;
    parentId: string | null;
    name: string;
    defaultPrice: number;
    hasQuantity: boolean;
    isToothSpecific: boolean;
    isCheckup: boolean;
    active: boolean;
    sortOrder: number;
}

export interface ProcedureNode extends Procedure {
    children: Procedure[];
    selectable: boolean;
}

export interface CustomQuestion {
    id: string;
    key: string;
    label: string;
    kind: QuestionKind;
    options: unknown;
    required: boolean;
    sortOrder: number;
    active: boolean;
}

export interface ClinicDay {
    weekday: number;
    branchId: string;
    opensAt: string;
    closesAt: string;
}
