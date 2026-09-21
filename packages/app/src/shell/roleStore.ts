import { CLIENT_ROLES, type ClientRole } from '@lustre/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { hydratingSubscribe } from './hydratingSubscribe';

// Which of the two views this handset opens in (§1). It lived in `AppShell`'s
// `useState`, which made it a fact about the current mount rather than about
// the phone: every cold launch put a secretary's handset back into the doctor's
// day view, with the clinic's rows under it.
//
// Same shape as `i18n`'s locale store: a module store read through
// `useSyncExternalStore`, hydrated by the first subscriber rather than at
// import, so nothing touches the native module until something renders.
const ROLE_KEY = 'lustre.role';

// The safe end of the switch, and so the answer to every question storage
// cannot settle — missing key, a value from a build that spelled the roles
// differently, a read that threw. The doctor's rows are the clinic's own
// numbers and the phone at the desk is the one likely to be picked up by
// somebody else, so an unknown role draws the secretary's screen and lets her
// switch, rather than guessing its way into the doctor's.
const FALLBACK_ROLE: ClientRole = 'secretary';

export interface RoleState {
    /** Nothing role-specific may draw before this: the alternative is a frame of the wrong view. */
    hydrated: boolean;
    role: ClientRole;
}

function isRole(value: string | null): value is ClientRole {
    return value !== null && (CLIENT_ROLES as readonly string[]).includes(value);
}

/**
 * Exported for the tests, which need the thing a cold launch produces: a store
 * that has never read storage. The module keeps one instance and that is what
 * the app uses.
 */
export function createRoleStore() {
    let state: RoleState = { hydrated: false, role: FALLBACK_ROLE };
    const listeners = new Set<() => void>();

    function emit(next: RoleState): void {
        state = next;
        for (const listener of listeners) listener();
    }

    // A switch confirmed while the read was still out is this phone's answer,
    // and the stored value is the question it just answered. Without this the
    // read lands second and puts the old role back.
    let chosen = false;

    async function hydrate(): Promise<void> {
        const stored = await AsyncStorage.getItem(ROLE_KEY).catch(() => null);
        if (chosen) return;
        emit({ hydrated: true, role: isRole(stored) ? stored : FALLBACK_ROLE });
    }

    const subscribe = hydratingSubscribe(listeners, hydrate);

    return {
        subscribe,
        getSnapshot: (): RoleState => state,
        // Applied before the write settles, for the reason `LocaleProvider` gives:
        // the switch has to feel immediate, and a failed write costs one
        // re-pick on the next launch rather than a wrong screen now.
        set(next: ClientRole): void {
            chosen = true;
            if (next !== state.role || !state.hydrated) emit({ hydrated: true, role: next });
            void AsyncStorage.setItem(ROLE_KEY, next).catch(() => undefined);
        },
    };
}

const store = createRoleStore();

export function useRole(): RoleState {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** Only ever from a confirmed switch — see `RoleSwitchSheet` in settings. */
export function setRole(next: ClientRole): void {
    store.set(next);
}
