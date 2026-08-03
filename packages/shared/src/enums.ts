import { z } from 'zod';

/**
 * Domain enums (SPEC §5). These are the string values stored in Postgres TEXT
 * columns and sent over the wire, so the tuples are the source of truth for
 * both the Drizzle schema and the client.
 */

/** §7. `checked_in` creates the visit; `done` is set at checkout. */
export const APPOINTMENT_STATUSES = ['booked', 'checked_in', 'done', 'cancelled', 'no_show'] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/**
 * Statuses that hold a slot. Only these participate in the `EXCLUDE USING gist`
 * overlap constraint — cancelled and no-show appointments free their slot.
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

/** §5. `select` carries an `options` array; the others ignore it. */
export const QUESTION_KINDS = ['text', 'number', 'boolean', 'select'] as const;
export const questionKindSchema = z.enum(QUESTION_KINDS);
export type QuestionKind = z.infer<typeof questionKindSchema>;

/** §11. No automated sending — the user marks a reminder sent or skipped. */
export const REMINDER_STATUSES = ['pending', 'sent', 'skipped'] as const;
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;

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
    checked_in: ['done'],
    done: [],
    cancelled: [],
    no_show: [],
} as const satisfies Record<AppointmentStatus, readonly AppointmentStatus[]>;

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
    return (APPOINTMENT_TRANSITIONS[from] as readonly AppointmentStatus[]).includes(to);
}
