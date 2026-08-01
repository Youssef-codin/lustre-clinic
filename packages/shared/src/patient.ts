import { z } from 'zod';
import type { Appointment } from './appointment.ts';
import type { IsoInstant } from './time.ts';

/**
 * Phone numbers are stored E.164 (`+20...`), but the secretary types what is
 * written on the paper book — `01012345678`, sometimes with spaces or dashes.
 * So input is permissive and the *server* normalizes on write; `Patient.phone`
 * coming back is always normalized. Never make the desk form do this.
 */
export const phoneInputSchema = z
    .string()
    .trim()
    .min(6)
    .max(24)
    .regex(/^\+?[\d\s-]+$/, 'expected digits, optionally starting with +');

export const patientNameSchema = z.string().trim().min(2).max(80);

export const patientNotesSchema = z.string().trim().max(1000);

export interface Patient {
    id: number;
    name: string;
    /** Normalized E.164 — `+20...`. */
    phone: string;
    notes: string | null;
    /** UTC ISO. */
    createdAt: IsoInstant;
}

/**
 * What a row in a list needs, and nothing more. Notes are the closest thing to
 * a clinical record in this system — they never ride along in a day view or a
 * search result, only on the patient's own page.
 */
export interface PatientSummary {
    id: number;
    name: string;
    /** Normalized E.164. Shown in results because two patients share a name. */
    phone: string;
}

/** The inline patient on a walk-in booking. See `createAppointmentSchema`. */
export const newPatientSchema = z.object({
    name: patientNameSchema,
    phone: phoneInputSchema,
});

export type NewPatient = z.infer<typeof newPatientSchema>;

/** `POST /api/patients` → `Patient` */
export const createPatientSchema = newPatientSchema.extend({
    notes: patientNotesSchema.optional(),
});

export type CreatePatientBody = z.infer<typeof createPatientSchema>;

/** `PATCH /api/patients/:id` → `Patient` */
export const updatePatientSchema = createPatientSchema
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'expected at least one field' });

export type UpdatePatientBody = z.infer<typeof updatePatientSchema>;

/**
 * `GET /api/patients?q=` → `PatientSummary[]`
 *
 * One box matching name or phone — the booking screen's patient picker types
 * into it on every keystroke, so it is capped rather than paginated.
 */
export const patientSearchQuerySchema = z.object({
    q: z.string().trim().min(1).max(80),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>;

export type PatientSearchResponse = PatientSummary[];

/**
 * `GET /api/patients/:id` — patient *and* history in one payload. The patient
 * page is opened by scanning a slip on a phone over clinic wifi; a second round
 * trip for the history is the difference between instant and noticeably slow.
 *
 * `appointments` is newest first and includes cancelled ones — the page shows
 * status per row.
 */
export interface PatientDetail {
    patient: Patient;
    appointments: Appointment[];
}
