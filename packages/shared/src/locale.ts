import { z } from 'zod';

/**
 * Arabic is the clinic's language; English exists for the doctor's phone and
 * for anyone supporting the install. Both are first-class — every user-facing
 * string must exist in both, and direction flips with the locale.
 */
export const LOCALES = ['ar', 'en'] as const;

export const localeSchema = z.enum(LOCALES);

export type Locale = (typeof LOCALES)[number];

export const LOCALE_DIR: Record<Locale, 'rtl' | 'ltr'> = {
    ar: 'rtl',
    en: 'ltr',
};

export const LOCALE_LABEL: Record<Locale, string> = {
    ar: 'العربية',
    en: 'English',
};

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
