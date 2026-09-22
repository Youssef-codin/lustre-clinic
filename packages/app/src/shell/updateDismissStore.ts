import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { hydratingSubscribe } from './hydratingSubscribe';

// Which APK build the home banner (`ApkUpdateBanner`) has been waved away for.
// A fact about the phone, not the mount: dismissed between two patients, it
// stays dismissed on the next launch, and Settings still carries the card for
// whenever the doctor gets round to it. Keyed by versionCode rather than a
// flag, so the next release shows again by itself.
//
// Same shape as `roleStore`: a module store read through
// `useSyncExternalStore`, hydrated by the first subscriber.
const DISMISSED_KEY = 'lustre.apkUpdateDismissed';

export interface DismissState {
    /** The banner holds until this: the alternative is a frame of it on a phone that already said no. */
    hydrated: boolean;
    /** The versionCode dismissed, or null when none has been. */
    versionCode: number | null;
}

function parse(stored: string | null): number | null {
    const code = stored === null ? Number.NaN : Number(stored);
    return Number.isSafeInteger(code) && code > 0 ? code : null;
}

/** Exported for the tests, which need the thing a cold launch produces. */
export function createDismissStore() {
    let state: DismissState = { hydrated: false, versionCode: null };
    const listeners = new Set<() => void>();

    function emit(next: DismissState): void {
        state = next;
        for (const listener of listeners) listener();
    }

    // A dismissal while the read is still out is this phone's answer.
    let chosen = false;

    async function hydrate(): Promise<void> {
        const stored = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null);
        if (chosen) return;
        emit({ hydrated: true, versionCode: parse(stored) });
    }

    return {
        subscribe: hydratingSubscribe(listeners, hydrate),
        getSnapshot: (): DismissState => state,
        // Applied before the write settles: the tap has to feel immediate, and
        // a failed write costs one more dismissal next launch, not a banner
        // that will not go.
        dismiss(versionCode: number): void {
            chosen = true;
            emit({ hydrated: true, versionCode });
            void AsyncStorage.setItem(DISMISSED_KEY, String(versionCode)).catch(() => undefined);
        },
    };
}

const store = createDismissStore();

export function useDismissedApkUpdate(): DismissState {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function dismissApkUpdate(versionCode: number): void {
    store.dismiss(versionCode);
}
