import {
    appointmentTypeSchema,
    clinicInfoSchema,
    localeSchema,
    timeRangeSchema,
    workingHoursSchema,
} from '@mawid/shared';
import { z } from 'zod';

const remindersSchema = z.object({
    enabled: z.boolean(),
    hoursBefore: z.number().positive(),
    sendWindow: timeRangeSchema,
    minLeadHours: z.number().nonnegative(),
    catchUp: z.object({
        minGapMinutes: z.number().positive(),
        maxGapMinutes: z.number().positive(),
        maxMessages: z.number().int().positive(),
    }),
    template: z.string().min(1),
});

const whatsappSchema = z.object({
    sessionPath: z.string().min(1),
    dryRun: z.boolean(),
});

const printingSchema = z.object({
    driver: z.enum(['pdf', 'escpos', 'file', 'none']),
    printerName: z.string().optional(),
    outputDir: z.string().optional(),
    escpos: z
        .object({
            interface: z.string().min(1),
            width: z.number().int().positive(),
        })
        .optional(),
});

const backupsSchema = z.object({
    local: z.string().min(1),
    external: z.string().optional(),
    offsite: z
        .object({
            enabled: z.boolean(),
            bucket: z.string().optional(),
            publicKey: z.string().optional(),
        })
        .optional(),
    intervalHours: z.number().positive(),
    retention: z.object({
        daily: z.number().int().nonnegative(),
        weekly: z.number().int().nonnegative(),
        monthly: z.number().int().nonnegative(),
    }),
});

export const configSchema = z
    .object({
        clinic: clinicInfoSchema,
        hours: workingHoursSchema,
        appointmentTypes: z.array(appointmentTypeSchema).min(1),
        reminders: remindersSchema,
        whatsapp: whatsappSchema,
        printing: printingSchema,
        server: z.object({
            port: z.number().int().min(1).max(65535),
            host: z.string().min(1),
        }),
        /**
         * Locale a device starts in. Each device can switch and its choice is
         * remembered locally, so this only sets the starting point.
         */
        defaultLocale: localeSchema.default('ar'),
        /** Used to build QR URLs — see spec §9. */
        hostname: z.string().min(1),
        /**
         * Country calling code the secretary's local input is expanded to when
         * normalizing to E.164 — `01012345678` → `+201012345678`. Required
         * rather than defaulted: both clinics are in Egypt today, and a default
         * in source is exactly the clinic-specific value spec §15 rules out.
         */
        phoneCountryCode: z.string().regex(/^\+\d{1,3}$/, 'expected a calling code like +20'),
        database: z.string().min(1).default('./mawid.sqlite'),
        backups: backupsSchema,
    })
    .refine((c) => c.reminders.catchUp.minGapMinutes <= c.reminders.catchUp.maxGapMinutes, {
        message: 'reminders.catchUp.minGapMinutes must be <= maxGapMinutes',
        path: ['reminders', 'catchUp'],
    })
    .refine((c) => c.appointmentTypes.every((t) => t.id.trim().length > 0), {
        message: 'every appointmentTypes[].id must be non-empty',
        path: ['appointmentTypes'],
    });

export type Config = z.infer<typeof configSchema>;
