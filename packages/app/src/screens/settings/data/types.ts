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

/**
 * `patientCount`, `openedYear` and `closedOn` are the branch list's second line
 * in the design — the size and age of a branch, which is what makes one row
 * distinguishable from another when two branches share a street name. None of
 * the three is on the server yet (BLOCKED.md); `closedOn` is null while the
 * branch is active and is never cleared on reactivation, because "closed for
 * eight months in 2025" stays true afterwards.
 */
export interface Branch {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    active: boolean;
    patientCount: number;
    openedYear: string;
    closedOn: string | null;
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
    labelAr: string | null;
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

export interface ClinicIdentity {
    name: string;
    phone: string;
}

/**
 * The durations offered when booking. `defaultDuration` is always one of
 * `durations` — the design states the rule on the pane ("pick another option
 * first if you want to remove it") and the API enforces it, so the booking
 * screen can pre-fill without checking.
 */
export interface AppointmentSettings {
    durations: number[];
    defaultDuration: number;
}

/**
 * `leadHours` is when a reminder becomes due; `notifyAt` and `repeatMinutes`
 * are about the phone, not the patient — the daily nudge while reminders are
 * still pending. `notifyAt` is minutes from midnight, the same unit the day
 * view measures time in, so it never needs a timezone.
 */
export interface ReminderSettings {
    leadHours: number;
    notifyAt: number;
    repeatMinutes: number;
    template: string;
}

/** The tokens a reminder template may carry, substituted per appointment. */
export const REMINDER_TOKENS = ['{name}', '{date}', '{time}', '{branch}', '{clinic}'] as const;

export const TEMPLATE_MAX = 320;
