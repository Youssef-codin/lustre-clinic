import { z } from 'zod';
import type { Locale } from './locale.ts';

/** "HH:MM", 24h. Times of day only — never a date. */
export const timeOfDaySchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM in 24-hour form');

export const timeRangeSchema = z
    .object({
        from: timeOfDaySchema,
        to: timeOfDaySchema,
    })
    .refine((r) => r.from < r.to, { message: '`from` must be earlier than `to`' });

/** Day-of-week key, 0 = Sunday. A missing day means the clinic is closed. */
export const weekdaySchema = z.enum(['0', '1', '2', '3', '4', '5', '6']);

/** Partial on purpose: an omitted day means the clinic is closed that day. */
export const workingHoursSchema = z.partialRecord(weekdaySchema, z.array(timeRangeSchema));

/**
 * `label` is Arabic, `labelEn` is optional — a clinic that never uses the
 * English view should not be forced to translate its own appointment types.
 * Where it is missing the Arabic label is shown in both locales.
 */
export const appointmentTypeSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    labelEn: z.string().min(1).optional(),
    minutes: z.number().int().positive(),
});

export const clinicInfoSchema = z.object({
    name: z.string().min(1),
    nameEn: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().min(1),
    addressEn: z.string().min(1).optional(),
    timezone: z.string().min(1),
});

export type TimeOfDay = z.infer<typeof timeOfDaySchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type Weekday = z.infer<typeof weekdaySchema>;
export type WorkingHours = z.infer<typeof workingHoursSchema>;
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;
export type ClinicInfo = z.infer<typeof clinicInfoSchema>;

/** `GET /api/config` — the slice of config.json the frontend is allowed to see. */
export interface PublicConfig {
    clinic: ClinicInfo;
    hours: WorkingHours;
    appointmentTypes: AppointmentType[];
    /** Locale a device starts in before anyone picks one. */
    defaultLocale: Locale;
}

/*
 * Config-supplied values are localized here rather than at each call site, so
 * printing and WhatsApp get the same fallback behaviour the UI does.
 */

export function clinicName(clinic: ClinicInfo, locale: Locale): string {
    return locale === 'en' ? clinic.nameEn : clinic.name;
}

export function clinicAddress(clinic: ClinicInfo, locale: Locale): string {
    return locale === 'en' ? (clinic.addressEn ?? clinic.address) : clinic.address;
}

export function appointmentTypeLabel(type: AppointmentType, locale: Locale): string {
    return locale === 'en' ? (type.labelEn ?? type.label) : type.label;
}
