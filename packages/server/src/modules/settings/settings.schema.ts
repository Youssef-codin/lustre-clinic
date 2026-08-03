import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from '@mawid/shared';
import { z } from 'zod';

/**
 * SPEC §12 — everything the clinic can configure is a row here, edited in-app.
 * `.env` holds only what a user must never touch.
 */

/** `HH:MM` or `HH:MM:SS`; Postgres `time` accepts both, and returns the latter. */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'expected HH:MM');

const duration = z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES);

export const updateSettingsInput = z
    .object({
        clinicName: z.string().trim().min(1).max(120),
        clinicPhone: z.string().trim().max(40).nullable(),
        durationOptions: z.array(duration).min(1).max(12),
        defaultDuration: duration,
        reminderLeadHours: z
            .number()
            .int()
            .min(0)
            .max(24 * 14),
        reminderNotifyAt: timeOfDay,
        reminderRepeatMinutes: z
            .number()
            .int()
            .min(1)
            .max(24 * 60),
        reminderTemplate: z.string().trim().min(1).max(1000),
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'nothing to update');

export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;
