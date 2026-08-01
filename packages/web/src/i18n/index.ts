import { type ErrorCode, isLocale, LOCALE_DIR, type Locale } from '@mawid/shared';
import { ar } from './ar.ts';
import { en } from './en.ts';

/** Shape of every dictionary, taken from Arabic — see the note in `ar.ts`. */
export type Dictionary = { [K in keyof typeof ar]: string };

export type TranslationKey = keyof Dictionary;

export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Dictionary> = { ar, en };

export function translate(locale: Locale, key: TranslationKey, vars?: Vars): string {
    const template = DICTIONARIES[locale][key];
    if (!vars) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = vars[name];
        return value === undefined ? match : String(value);
    });
}

/** Every `ERROR_CODE` has a matching `error.<CODE>` key, so this cannot miss. */
export function errorKey(code: ErrorCode): TranslationKey {
    return `error.${code}` as TranslationKey;
}

const STORAGE_KEY = 'mawid.locale';

export function storedLocale(): Locale | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return isLocale(value) ? value : null;
    } catch {
        // Private browsing or a locked-down device — fall back to the default.
        return null;
    }
}

export function storeLocale(locale: Locale): void {
    try {
        localStorage.setItem(STORAGE_KEY, locale);
    } catch {
        // Not being able to remember the choice is not worth breaking over.
    }
}

/**
 * Direction is part of the locale, not a separate setting — Tailwind logical
 * properties do the rest of the work once `dir` flips.
 */
export function applyLocaleToDocument(locale: Locale): void {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_DIR[locale];
}
