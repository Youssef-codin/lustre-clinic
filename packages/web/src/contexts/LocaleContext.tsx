import { LOCALE_DIR, type Locale } from '@mawid/shared';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import {
    applyLocaleToDocument,
    storedLocale,
    storeLocale,
    type TranslationKey,
    translate,
    type Vars,
} from '../i18n/index.ts';

interface LocaleValue {
    locale: Locale;
    dir: 'rtl' | 'ltr';
    /**
     * `persist: false` applies a locale without recording a choice — used for
     * the clinic default, so a device keeps following it if the default changes.
     */
    setLocale: (locale: Locale, persist?: boolean) => void;
    t: (key: TranslationKey, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleValue | null>(null);

/** The locale this device starts in, before `/api/config` has been read. */
export const initialLocale: Locale = storedLocale() ?? 'ar';

export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(initialLocale);

    const setLocale = useCallback((next: Locale, persist = true) => {
        setLocaleState(next);
        if (persist) storeLocale(next);
        applyLocaleToDocument(next);
    }, []);

    const value = useMemo<LocaleValue>(
        () => ({
            locale,
            dir: LOCALE_DIR[locale],
            setLocale,
            t: (key, vars) => translate(locale, key, vars),
        }),
        [locale, setLocale],
    );

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleValue {
    const value = useContext(LocaleContext);
    if (!value) throw new Error('useI18n must be used inside <LocaleProvider>');
    return value;
}
