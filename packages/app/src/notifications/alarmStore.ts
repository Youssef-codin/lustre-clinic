import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { hydratingSubscribe } from '../shell/hydratingSubscribe';

// Whether this phone's daily reminder nudge rings like an alarm. A fact about
// the phone, like "Notify me at" is framed: each person chooses how loudly
// their own handset nags them, so it is not a clinic setting. Off unless
// someone turns it on — an alarm going off in a waiting room is not a default.
//
// Same shape as `shell/roleStore`: a module store read through
// `useSyncExternalStore`, hydrated by the first subscriber.
const ALARM_KEY = 'lustre.reminderAlarm';

export interface AlarmState {
    /** The nudge is not armed before this, or a phone set to ring would arm a quiet series first. */
    hydrated: boolean;
    enabled: boolean;
}

/** Exported for the tests, which need the thing a cold launch produces. */
export function createAlarmStore() {
    let state: AlarmState = { hydrated: false, enabled: false };
    const listeners = new Set<() => void>();

    function emit(next: AlarmState): void {
        state = next;
        for (const listener of listeners) listener();
    }

    let chosen = false;
    let writes = 0;

    async function hydrate(): Promise<void> {
        const stored = await AsyncStorage.getItem(ALARM_KEY).catch(() => null);
        if (chosen) return;
        emit({ hydrated: true, enabled: stored === 'on' });
    }

    return {
        subscribe: hydratingSubscribe(listeners, hydrate),
        getSnapshot: (): AlarmState => state,
        set(enabled: boolean): void {
            chosen = true;
            const previous = state.enabled;
            const write = ++writes;
            emit({ hydrated: true, enabled });
            // A write that did not land goes back on screen too, or the switch
            // would read off while the next launch comes up ringing. Only the
            // latest flip is undone; an older one was already overtaken.
            void AsyncStorage.setItem(ALARM_KEY, enabled ? 'on' : 'off').catch(() => {
                if (write === writes) emit({ hydrated: true, enabled: previous });
            });
        },
    };
}

const store = createAlarmStore();

export function useReminderAlarm(): AlarmState {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function setReminderAlarm(enabled: boolean): void {
    store.set(enabled);
}
