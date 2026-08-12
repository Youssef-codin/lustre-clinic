/**
 * The shapes the day view reads off the wire. Hand-written, which the guide
 * forbids — request and response types should be inferred from `AppRouter` —
 * but the inference cannot reach: `packages/app` does not depend on
 * `packages/server`, and the tRPC client has not landed (BLOCKED.md). What the
 * inference *can* supply — the status, channel and method unions, the tooth
 * enum — is imported from `@lustre/shared` rather than restated. Dates are
 * strings: there is no transformer on the server, so a `timestamptz` arrives
 * as the ISO string JSON made of it. Money is integer piastres everywhere
 * (§9); `visit.balance` is derived, never stored (§10); and a weekday with no
 * `clinic_days` row is a closed day. A reminder row carries the rendered
 * message and a `wa.me` URL, and the user marks it sent or skipped, because
 * delivery cannot be confirmed.
 */
import type { AppointmentChannel, AppointmentStatus, PaymentMethod, Tooth } from '@lustre/shared';

export interface EmbeddedPatient {
    id: string;
    name: string;
    phone: string;
}

export interface AppointmentProcedure {
    id: string;
    procedureId: string;
    name: string;
    quantity: number;
    tooth: Tooth | null;
    note: string | null;
}

export interface Appointment {
    id: string;
    ref: string;
    patientId: string;
    branchId: string;
    startsAt: string;
    durationMinutes: number;
    procedures: AppointmentProcedure[];
    note: string | null;
    status: AppointmentStatus;
    channel: AppointmentChannel;
    createdAt: string;
    updatedAt: string;
    patient: EmbeddedPatient;
}

export type AppointmentRow = Omit<Appointment, 'patient'>;

/** A booked appointment the walk-in pushed out of its way, and where it went. */
export interface MovedAppointment {
    id: string;
    from: string;
    to: string;
}

export interface WalkInResult {
    appointment: AppointmentRow;
    visitId: string;
    /** Empty when the walk-in fitted in a gap and nobody had to move. */
    moved: MovedAppointment[];
}

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
    balance: number;
}

export interface VisitRow {
    id: string;
    appointmentId: string;
    checkedInAt: string;
    computedTotal: number;
    chargedTotal: number;
}

export interface ClinicDay {
    weekday: number;
    branchId: string;
    opensAt: string;
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

export interface ProcedureType {
    id: string;
    name: string;
    defaultPrice: number;
}

/**
 * `procedure.tree` — one level of nesting (§5): a root is either selectable on
 * its own (Extraction) or a category whose children are the variants that carry
 * the price (Composite filling → Class I/II/III). `isToothSpecific` is what
 * makes the picker ask which tooth before it asks which procedure.
 */
export interface ProcedureRow {
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

export interface ProcedureCategory extends ProcedureRow {
    children: ProcedureRow[];
    /** No children — the root is the procedure, not a heading. */
    selectable: boolean;
}

export interface PendingReminder {
    id: string;
    appointmentId: string;
    dueAt: string;
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
