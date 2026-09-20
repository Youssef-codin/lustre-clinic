/**
 * The locale, readable without React.
 *
 * `LocaleProvider` is the owner and writes here on every change; this module
 * exists for the formatters and `ERROR_CODE` mappers that are called from
 * event handlers and plain functions rather than rendered. It is deliberately
 * outside the barrel and free of React and AsyncStorage, so importing it does
 * not drag the provider into a module that only needs to know the language.
 */
import type { Locale } from '@lustre/shared';

let runtimeLocale: Locale = 'en';

export function getLocale(): Locale {
    return runtimeLocale;
}

export function setRuntimeLocale(locale: Locale): void {
    runtimeLocale = locale;
}
