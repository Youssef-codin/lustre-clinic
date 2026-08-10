import type { AppointmentChannel, AppointmentStatus, PaymentMethod, Tooth } from '@mawid/shared';

/**
 * The shapes the day view reads off the wire.
 *
 * These are hand-written, which the guide forbids — request and response types
 * are inferred from `AppRouter`. They are here because the inference cannot
 * reach: `packages/app` does not depend on `packages/server`, and the tRPC
 * client that would carry the type has not landed (BLOCKED.md). Everything the
 * inference *can* supply — the status, channel and method unions, the tooth
 * enum — is imported from `@mawid/shared` rather than restated, so the parts
 * that drift loudly are the parts that cannot drift at all.
 *
 * Dates are strings. There is no transformer on the server (`trpc/init.ts`), so
 * a `timestamptz` arrives as the ISO string `JSON.stringify` made of it.
 */

export interface EmbeddedPatient {
    id: string;
    name: string;
    phone: string;
}

/** `appointment.byDate` / `.byId` — the row with its patient embedded (§13). */
export interface Appointment {
    id: string;
    ref: string;
    patientId: string;
    branchId: string;
    /** ISO 8601 with offset. */
    startsAt: string;
    durationMinutes: number;
    typeId: string | null;
    note: string | null;
    status: AppointmentStatus;
    channel: AppointmentChannel;
    createdAt: string;
    updatedAt: string;
    patient: EmbeddedPatient;
}

/** `appointment.create` / `.update` / `.cancel` — no patient embedded. */
export type AppointmentRow = Omit<Appointment, 'patient'>;

export interface WalkInResult {
    appointment: AppointmentRow;
    visitId: string;
}

/** A line on a visit. Money is integer piastres, everywhere, always (§9). */
export interface VisitLine {
    id: string;
    procedureId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    isCheckup: boolean;
    tooth: Tooth | null;
    note: string | null;
    lineTotal: number;
}

export interface VisitPayment {
    id: string;
    amount: number;
    method: PaymentMethod;
    methodNote: string | null;
    paidAt: string;
}

export interface Visit {
    id: string;
    appointmentId: string;
    checkedInAt: string;
    pricedAt: string | null;
    completedAt: string | null;
    computedTotal: number;
    chargedTotal: number;
    createdAt: string;
    procedures: VisitLine[];
    payments: VisitPayment[];
    paidTotal: number;
    /** Derived, never stored (§10). */
    balance: number;
}

/** `visit.checkIn` returns the bare row — no procedures, no payments yet. */
export interface VisitRow {
    id: string;
    appointmentId: string;
    checkedInAt: string;
    computedTotal: number;
    chargedTotal: number;
}

/** `settings.schedule` — MAW-1. A weekday with no row is a closed day. */
export interface ClinicDay {
    /** 0 = Sunday … 6 = Saturday, matching `Date#getDay`. */
    weekday: number;
    branchId: string;
    /** `HH:MM`. */
    opensAt: string;
    /** `HH:MM`. */
    closesAt: string;
}

export interface Branch {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
}

export interface Patient {
    id: string;
    name: string;
    phone: string;
}

/**
 * `procedure.list` — the selectable rows only, categories already filtered out.
 * The day view wants one field of it: the name behind an appointment's
 * `typeId`, so a row can read "Check-up · 20 min" the way the design draws it.
 */
export interface ProcedureType {
    id: string;
    name: string;
    defaultPrice: number;
}

/**
 * `reminder.pending` — SPEC §11. Nothing sends itself: the row carries the
 * rendered message and a `wa.me` URL, and the user marks it sent or skipped
 * after WhatsApp has been opened, because delivery cannot be confirmed.
 */
export interface PendingReminder {
    id: string;
    appointmentId: string;
    /** ISO 8601. */
    dueAt: string;
    /** ISO 8601 — the appointment the message is about. */
    startsAt: string;
    ref: string;
    patient: EmbeddedPatient;
    whatsAppUrl: string;
    message: string;
}

export interface ClinicSettings {
    clinicName: string;
    durationOptions: number[];
    defaultDuration: number;
}
