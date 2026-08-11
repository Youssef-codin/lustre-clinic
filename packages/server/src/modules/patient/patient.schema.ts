/**
 * SPEC §5. `phone` is normalized to E.164 in the service, not here. `custom` is
 * keyed by `custom_questions.key` and validated against them on write. Age is
 * derived from `birthDate` at read time and never stored.
 */
import { z } from 'zod';

const customAnswers = z.record(z.string(), z.unknown());

export const createPatientInput = z.object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(5).max(32),
    email: z.email().max(200).nullish(),
    birthDate: z.iso.date().nullish(),
    gender: z.string().trim().max(40).nullish(),
    custom: customAnswers.default({}),
    notes: z.string().trim().max(4000).nullish(),
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
});

export const searchPatientInput = z.object({
    q: z.string().trim().max(120),
    limit: z.number().int().min(1).max(100).default(25),
});

export const patientByIdInput = z.object({ id: z.uuid() });

export type CreatePatientInput = z.infer<typeof createPatientInput>;
export type UpdatePatientInput = z.infer<typeof updatePatientInput>;
export type SearchPatientInput = z.infer<typeof searchPatientInput>;
