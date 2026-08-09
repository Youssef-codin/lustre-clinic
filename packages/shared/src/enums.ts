import { z } from 'zod';

/**
 * Domain enums (SPEC §5). These are the string values stored in Postgres TEXT
 * columns and sent over the wire, so the tuples are the source of truth for
 * both the Drizzle schema and the client.
 */

/**
 * §7. `checked_in` creates the visit; `done` is set at checkout.
 *
 * `awaiting_payment` is optional: the doctor marks it when he is finished and
 * the patient goes to the desk to pay. Checkout still works straight from
 * `checked_in`, which is what a walk-in or a quick checkup does.
 */
export const APPOINTMENT_STATUSES = [
    'booked',
    'checked_in',
    'awaiting_payment',
    'done',
    'cancelled',
    'no_show',
] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/**
 * Statuses that hold a slot. Only these participate in the `EXCLUDE USING gist`
 * overlap constraint — cancelled and no-show appointments free their slot, and
 * so does `awaiting_payment`: that patient has left the chair, so the slot is
 * bookable again even though the visit is not settled.
 */
export const SLOT_HOLDING_STATUSES = ['booked', 'checked_in'] as const satisfies readonly AppointmentStatus[];

/** How the appointment came to exist. A walk-in is booked and checked in at once. */
export const APPOINTMENT_CHANNELS = ['desk', 'walk_in'] as const;
export const appointmentChannelSchema = z.enum(APPOINTMENT_CHANNELS);
export type AppointmentChannel = z.infer<typeof appointmentChannelSchema>;

/** §5. Fixed, not configurable. `other` requires `methodNote`. */
export const PAYMENT_METHODS = ['cash', 'visa', 'instapay', 'other'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * §5. `select` carries an `options` array; the others ignore it.
 *
 * A `date` answer is stored in `patients.custom` as a `YYYY-MM-DD` string —
 * a calendar date, with no time and no timezone. A birthday or a last-x-ray
 * date is the same date wherever it is read.
 */
export const QUESTION_KINDS = ['text', 'number', 'boolean', 'select', 'date'] as const;
export const questionKindSchema = z.enum(QUESTION_KINDS);
export type QuestionKind = z.infer<typeof questionKindSchema>;

/** §11. No automated sending — the user marks a reminder sent or skipped. */
export const REMINDER_STATUSES = ['pending', 'sent', 'skipped'] as const;
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;

/**
 * §5. Palmer notation — quadrant then position, e.g. `UL6` is the upper-left
 * first molar. The quadrants read clockwise from the patient's upper right, and
 * each runs 1 (central incisor) outwards to 8 (third molar).
 *
 * Null on a `visit_procedures` line means the procedure is not tooth-specific.
 */
// biome-ignore format: one line per quadrant reads as a dental chart
export const PERMANENT_TEETH = [
    'UR1', 'UR2', 'UR3', 'UR4', 'UR5', 'UR6', 'UR7', 'UR8',
    'UL1', 'UL2', 'UL3', 'UL4', 'UL5', 'UL6', 'UL7', 'UL8',
    'LL1', 'LL2', 'LL3', 'LL4', 'LL5', 'LL6', 'LL7', 'LL8',
    'LR1', 'LR2', 'LR3', 'LR4', 'LR5', 'LR6', 'LR7', 'LR8',
] as const;

/** §5. Primary dentition, lettered A–E in the same quadrant order. */
// biome-ignore format: one line per quadrant reads as a dental chart
export const DECIDUOUS_TEETH = [
    'URA', 'URB', 'URC', 'URD', 'URE',
    'ULA', 'ULB', 'ULC', 'ULD', 'ULE',
    'LLA', 'LLB', 'LLC', 'LLD', 'LLE',
    'LRA', 'LRB', 'LRC', 'LRD', 'LRE',
] as const;

/**
 * Every selectable tooth. The client renders this as a searchable dropdown
 * rather than a free-text field, so the stored value is always one of these.
 */
export const TEETH = [...PERMANENT_TEETH, ...DECIDUOUS_TEETH] as const;
export const toothSchema = z.enum(TEETH);
export type Tooth = z.infer<typeof toothSchema>;

/** `UR` | `UL` | `LL` | `LR` — the dropdown groups by this. */
export function toothQuadrant(tooth: Tooth): string {
    return tooth.slice(0, 2);
}

/** §6. A client-side preference, not a permission boundary. */
export const CLIENT_ROLES = ['secretary', 'doctor'] as const;
export const clientRoleSchema = z.enum(CLIENT_ROLES);
export type ClientRole = z.infer<typeof clientRoleSchema>;

/** §14. English is primary; Arabic mirrors the layout. */
export const LOCALES = ['en', 'ar'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

/**
 * Allowed status transitions (§7). Missed appointments are resolved manually,
 * so nothing here happens on a timer.
 */
export const APPOINTMENT_TRANSITIONS = {
    booked: ['checked_in', 'cancelled', 'no_show'],
    // `awaiting_payment` is a stop on the way to `done`, never a required one.
    checked_in: ['awaiting_payment', 'done'],
    awaiting_payment: ['done'],
    done: [],
    cancelled: [],
    no_show: [],
} as const satisfies Record<AppointmentStatus, readonly AppointmentStatus[]>;

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
    return (APPOINTMENT_TRANSITIONS[from] as readonly AppointmentStatus[]).includes(to);
}
