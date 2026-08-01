import { z } from 'zod';
import type { PatientSummary } from './patient.ts';
import { dateQuerySchema, type IsoInstant } from './time.ts';

export const REMINDER_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

/**
 * Why a reminder was not sent. Every one of these is a patient the secretary
 * has to phone, so the reason is stored rather than logged — see §9.
 */
export const REMINDER_SKIP_REASONS = [
    /** The appointment already started. Reminding now looks broken. */
    'started',
    /** Closer than `reminders.minLeadHours` — too late to be useful. */
    'too_late',
    'cancelled',
    /** Catch-up hit `reminders.catchUp.maxMessages`. A ten-hour trickle is not
     *  a recovery; these get phoned instead. */
    'catch_up_cap',
] as const;
export const reminderSkipReasonSchema = z.enum(REMINDER_SKIP_REASONS);
export type ReminderSkipReason = (typeof REMINDER_SKIP_REASONS)[number];

export interface Reminder {
    id: number;
    appointmentId: number;
    status: ReminderStatus;
    /** `starts_at - hoursBefore`, snapped back into open hours. UTC ISO. */
    scheduledFor: IsoInstant;
    sentAt: IsoInstant | null;
    /** Send error, `status: 'failed'` only. */
    error: string | null;
    /** Set on `status: 'skipped'`, null otherwise. */
    skipReason: ReminderSkipReason | null;
    attempts: number;
}

/**
 * `GET /api/reminders?date=` → one row per appointment that day.
 *
 * Carries the patient and the appointment time because the screen this feeds is
 * "these patients were not reminded" — the secretary reads a name, a phone and
 * a time off it and picks up the handset. Making her click into each row to get
 * the number would defeat the point of showing the list at all.
 */
export interface ReminderWithPatient extends Reminder {
    patient: PatientSummary;
    appointmentStartsAt: IsoInstant;
}

export type RemindersResponse = ReminderWithPatient[];

/** `GET /api/reminders?date=` */
export const remindersQuerySchema = dateQuerySchema;
