import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { hydratingSubscribe } from '../../shell/hydratingSubscribe';
import type { SavedSchedule } from './savedSchedule';

// Same shape as `notifications/alarmStore`: a module store read through
// `useSyncExternalStore`, hydrated by the first subscriber. It holds the raw
// string; `usableSchedule` decides at draw time whether it is still this
// server's and still today's, since both can change without a write here.
const KEY = 'lustre.savedSchedule';

/** Exported for the tests, which need the thing a cold launch produces. */
export function createSavedScheduleStore() {
    let raw: string | null = null;
    const listeners = new Set<() => void>();
    let written = false;

    function emit(next: string | null): void {
        raw = next;
        for (const listener of listeners) listener();
    }

    async function hydrate(): Promise<void> {
        const stored = await AsyncStorage.getItem(KEY).catch(() => null);
        if (written) return;
        emit(stored);
    }

    return {
        subscribe: hydratingSubscribe(listeners, hydrate),
        getSnapshot: (): string | null => raw,
        // A write that fails leaves the last copy that landed on disk. It is
        // still stamped with its own time, so it never reads as newer than it is.
        async save(schedule: SavedSchedule): Promise<void> {
            const next = JSON.stringify(schedule);
            written = true;
            emit(next);
            await AsyncStorage.setItem(KEY, next).catch(() => undefined);
        },
    };
}

const store = createSavedScheduleStore();

export function useStoredSchedule(): string | null {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function saveSchedule(schedule: SavedSchedule): Promise<void> {
    return store.save(schedule);
}
