// The payload shapes this cluster reads, hand-mirrored from the server's
// `patient` and `customQuestion` services — hand-written because there is no
// tRPC client yet, so `AppRouter` cannot be inferred here. When the client
// lands this file is deleted and the types come from inference. `Date` columns
// arrive as ISO strings over JSON, so they are typed as strings. Notable
// invariants: `key` is the stable key into `patients.custom` and never changes
// once answers exist; `active` is one verb — a question is deactivated, never
// deleted, so its answers survive (§7.8); `age` and `balance` are derived,
// never stored; `UpdatePatientInput.custom` is a partial patch — only the keys
// sent are validated, a blank clears, and keys left out keep what is stored.
import type { AppointmentStatus } from '@lustre/shared';

export type QuestionKind = 'text' | 'number' | 'boolean' | 'select' | 'date';

export interface CustomQuestion {
    id: string;
    key: string;
    label: string;
    kind: QuestionKind;
    options: string[] | null;
    required: boolean;
    sortOrder: number;
    active: boolean;
}

export type Answers = Record<string, unknown>;

export type QuestionnaireGapReason = 'unanswered' | 'answer_no_longer_valid';

export interface QuestionnaireGap {
    key: string;
    label: string;
    required: boolean;
    reason: QuestionnaireGapReason;
}

export interface Patient {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    birthDate: string | null;
    gender: string | null;
    custom: Answers;
    notes: string | null;
    createdAt: string;
    age: number | null;
}

/** What was done at a visit, or — when the patient never reached the chair — what was going to be. */
export interface HistoryProcedure {
    name: string;
    quantity: number;
    tooth: string | null;
}

/**
 * One row of the history: an appointment, and the visit it became if it became
 * one. A cancellation and a no-show never produce a visit and are still part of
 * what the record is read for, so `visitId` is null and the money is zero on
 * them rather than the row being absent.
 */
export interface PatientHistoryEntry {
    appointmentId: string;
    visitId: string | null;
    ref: string;
    startsAt: string;
    status: AppointmentStatus;
    checkedInAt: string | null;
    completedAt: string | null;
    computedTotal: number;
    chargedTotal: number;
    paidTotal: number;
    balance: number;
    procedures: HistoryProcedure[];
}

export interface PatientDetail {
    patient: Patient;
    history: PatientHistoryEntry[];
    questionnaireGaps: QuestionnaireGap[];
}

export interface PatientBalance {
    patientId: string;
    balance: number;
}

export interface UpdatePatientInput {
    id: string;
    custom?: Answers;
}
