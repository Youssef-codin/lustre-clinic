/**
 * SPEC §5. `phone` is normalized to E.164 in the service, not here. `custom` is
 * keyed by `custom_questions.key` and validated against them on write. Age is
 * derived from `birthDate` at read time and never stored.
 *
 * `old` is the block the New patient screen reveals behind its **Old patient**
 * switch: someone the clinic already had before the cutoff, carrying their own
 * number, what they owed on it, and whatever the paper file records they had
 * done. Its absence is what makes a registration a new one, so nothing about a
 * new patient changes by the block existing.
 */
import { clientRoleSchema, MAX_AMOUNT_PIASTRES, MAX_OLD_REF_LENGTH, TEETH } from '@lustre/shared';
import { z } from 'zod';

const customAnswers = z.record(z.string(), z.unknown());

/**
 * The old system's number for this patient, off the paper file. Loose on
 * purpose — it is whatever that system used, not a `ref` this one generates,
 * and validating a format the app does not own would refuse real numbers.
 */
const legacyRef = z.string().trim().max(MAX_OLD_REF_LENGTH);

/**
 * One line off the paper file: what was done, and when if the file says. The
 * shape is `appointment_procedures` minus the sort order, because that is what
 * it is written as — work planned and never priced here (§7). No price: the old
 * system billed it, this one is only recording that it happened.
 */
const oldProcedureInput = z.object({
    procedureId: z.uuid(),
    quantity: z.number().int().min(1).max(999).default(1),
    tooth: z.enum(TEETH).nullish(),
    /**
     * `YYYY-MM-DD`, or absent. Absent is the honest answer far more often than
     * it looks — the file says what was done and not always when — and the
     * record labels it *before migration* rather than picking a day.
     *
     * No `offsetMinutes` rides with it, unlike every other date this API takes.
     * See `migration.service`: these rows are a date being *labelled*, not a day
     * being bounded, so they are stamped at noon UTC and read back as the day
     * they name from any offset.
     */
    performedOn: z.iso.date().nullish(),
});

/** Fifty lines is a long file. Past that it is a paste, not a history. */
const MAX_OLD_PROCEDURES = 50;

export const oldPatientInput = z.object({
    /**
     * The number the old system knew them by, which becomes this patient's
     * `ref`: the desk was given one number for them and must not be handed a
     * second. Never validated for shape — that format is the old system's.
     */
    ref: z.string().trim().min(1).max(MAX_OLD_REF_LENGTH),
    /** What they owed at the cutoff. Zero is not a balance, it is the absence of one. */
    openingBalance: z.number().int().positive().max(MAX_AMOUNT_PIASTRES).optional(),
    procedures: z.array(oldProcedureInput).max(MAX_OLD_PROCEDURES).default([]),
});

export const createPatientInput = z.object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(5).max(32),
    email: z.email().max(200).nullish(),
    birthDate: z.iso.date().nullish(),
    gender: z.string().trim().max(40).nullish(),
    custom: customAnswers.default({}),
    notes: z.string().trim().max(4000).nullish(),
    legacyRef: legacyRef.nullish(),
    old: oldPatientInput.optional(),
});

export const updatePatientInput = z.object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(160).optional(),
    phone: z.string().trim().min(5).max(32).optional(),
    email: z.email().max(200).nullish(),
    birthDate: z.iso.date().nullish(),
    gender: z.string().trim().max(40).nullish(),
    custom: customAnswers.optional(),
    notes: z.string().trim().max(4000).nullish(),
    legacyRef: legacyRef.nullish(),
});

export const searchPatientInput = z.object({
    q: z.string().trim().max(120),
    limit: z.number().int().min(1).max(100).default(25),
});

export const recentPatientsInput = z.object({
    limit: z.number().int().min(1).max(100).default(25),
});

export const patientByIdInput = z.object({ id: z.uuid() });

/**
 * Correcting the number a record is already known by — not the same act as
 * registering one, which is why it is not a field on `updatePatientInput`.
 *
 * The shape is checked in the service rather than here, so a mistyped ref comes
 * back as `PATIENT_REF_INVALID` and names the field, instead of as the generic
 * `VALIDATION` a Zod `regex` would produce. `editedBy` is the role the client
 * says it is on; the service decides whether that role may edit at all, and the
 * value is what lands in the audit trail.
 */
export const updatePatientRefInput = z.object({
    id: z.uuid(),
    ref: z.string().trim().min(1).max(MAX_OLD_REF_LENGTH),
    editedBy: clientRoleSchema,
});

export const patientRefHistoryInput = z.object({ id: z.uuid() });

export const deletePatientInput = z.object({ id: z.uuid() });

/** Loose on purpose — the service normalizes, and a term that will not normalize answers `[]`. */
export const patientByPhoneInput = z.object({ phone: z.string().trim().max(32) });

export type CreatePatientInput = z.infer<typeof createPatientInput>;
export type OldPatientInput = z.infer<typeof oldPatientInput>;
export type UpdatePatientInput = z.infer<typeof updatePatientInput>;
export type UpdatePatientRefInput = z.infer<typeof updatePatientRefInput>;
export type SearchPatientInput = z.infer<typeof searchPatientInput>;
export type RecentPatientsInput = z.infer<typeof recentPatientsInput>;
export type PatientByPhoneInput = z.infer<typeof patientByPhoneInput>;
