/**
 * SPEC §7, §13. `patient` is a discriminated union: book for someone on file,
 * or create them in the same transaction.
 *
 * `offsetMinutes` is the client's UTC offset, so "today" and date inputs mean
 * the clinic's day. `updateAppointmentInput.status` sets only `no_show` —
 * cancel and check-in have their own calls. `awaitPaymentInput` marks that the
 * doctor is finished and the patient pays at the desk (§7).
 */
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from '@mawid/shared';
import { z } from 'zod';

const duration = z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES);

const offsetMinutes = z.number().int().min(-840).max(840).default(0);

export const patientRefInput = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('existing'), patientId: z.uuid() }),
    z.object({
        kind: z.literal('new'),
        name: z.string().trim().min(1).max(160),
        phone: z.string().trim().min(5).max(32),
    }),
]);

export const createAppointmentInput = z.object({
    patient: patientRefInput,
    branchId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    durationMinutes: duration.optional(),
    typeId: z.uuid().nullish(),
    note: z.string().trim().max(2000).nullish(),
    offsetMinutes,
});

export const walkInInput = z.object({
    patient: patientRefInput,
    branchId: z.uuid(),
    durationMinutes: duration.optional(),
    typeId: z.uuid().nullish(),
    note: z.string().trim().max(2000).nullish(),
    offsetMinutes,
});

export const byDateInput = z.object({
    date: z.iso.date(),
    branchId: z.uuid().optional(),
    offsetMinutes,
});

export const byIdInput = z.object({ id: z.uuid() });

export const updateAppointmentInput = z.object({
    id: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    durationMinutes: duration.optional(),
    branchId: z.uuid().optional(),
    typeId: z.uuid().nullish(),
    note: z.string().trim().max(2000).nullish(),
    status: z.literal('no_show').optional(),
});

export const cancelAppointmentInput = z.object({ id: z.uuid() });

export const awaitPaymentInput = z.object({ id: z.uuid() });

export const missedInput = z
    .object({
        branchId: z.uuid().optional(),
        limit: z.number().int().min(1).max(200).default(100),
    })
    .default({ limit: 100 });

export type CreateAppointmentInput = z.infer<typeof createAppointmentInput>;
export type WalkInInput = z.infer<typeof walkInInput>;
export type ByDateInput = z.infer<typeof byDateInput>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentInput>;
export type MissedInput = z.infer<typeof missedInput>;
export type PatientRefInput = z.infer<typeof patientRefInput>;
