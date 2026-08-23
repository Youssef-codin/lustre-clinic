import { LOCALES, type Locale } from '@lustre/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// The language this handset draws in (§14). It lived in `SettingsScreen`'s
// `useState` while the only thing that read it was the picker itself; it moved
// here when the clinic's own labels became bilingual, because the screens that
// have to choose between the two — the patient record, check-in — are nowhere
// near settings and had no way to ask.
//
// Same shape as `serverStore`: a module store read through
// `useSyncExternalStore`, hydrated by the first subscriber rather than at
// import, so nothing touches the native module until something renders.
const LOCALE_KEY = 'lustre.locale';

// English until storage says otherwise. The unhydrated frame is the one risk
// worth naming: a phone set to Arabic draws English for the frame before
// hydration lands. That is a single frame on a label, not a wrong screen, so it
// does not earn the boot gate `serverStore` has.
const DEFAULT_LOCALE: Locale = 'en';

let locale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();
let hydrating = false;

function emit(next: Locale): void {
    locale = next;
    for (const listener of listeners) listener();
}

function isLocale(value: string | null): value is Locale {
    return value !== null && (LOCALES as readonly string[]).includes(value);
}

async function hydrate(): Promise<void> {
    const stored = await AsyncStorage.getItem(LOCALE_KEY).catch(() => null);
    if (isLocale(stored) && stored !== locale) emit(stored);
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (!hydrating) {
        hydrating = true;
        void hydrate();
    }
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): Locale {
    return locale;
}

export function useLocale(): Locale {
    return useSyncExternalStore(subscribe, getSnapshot);
}

// Applied before the write settles: the picker has to feel immediate, and a
// failed write costs one re-pick on the next launch.
export function setLocale(next: Locale): void {
    if (next === locale) return;
    emit(next);
    void AsyncStorage.setItem(LOCALE_KEY, next).catch(() => undefined);
}
