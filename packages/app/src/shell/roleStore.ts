import { CLIENT_ROLES, type ClientRole, type Role, viewOf } from '@lustre/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { Credential } from '../api';
import { hydratingSubscribe } from './hydratingSubscribe';

// Which of the two views this handset opens in (§1), and who it is.
//
// A provisioned phone is whatever its credential says (`api/credential`), and
// that is the only way a phone's role changes: an admin's code, redeemed. What
// follows is the phone that has not scanned one yet — the view it was left on
// before roles existed, read and never written, so it keeps opening where it
// did until it is provisioned.
//
// That view lived in `AppShell`'s
// `useState`, which made it a fact about the current mount rather than about
// the phone: every cold launch put a secretary's handset back into the doctor's
// day view, with the clinic's rows under it.
//
// Same shape as `i18n`'s locale store: a module store read through
// `useSyncExternalStore`, hydrated by the first subscriber rather than at
// import, so nothing touches the native module until something renders.
const ROLE_KEY = 'lustre.role';

// The answer to every question storage cannot settle — missing key, a value from a build that spelled the roles
// differently, a read that threw. The doctor's rows are the clinic's own
// numbers and the phone at the desk is the one likely to be picked up by
// somebody else, so an unknown role draws the secretary's screen rather than
// guessing its way into the doctor's.
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

    async function hydrate(): Promise<void> {
        const stored = await AsyncStorage.getItem(ROLE_KEY).catch(() => null);
        emit({ hydrated: true, role: isRole(stored) ? stored : FALLBACK_ROLE });
    }

    const subscribe = hydratingSubscribe(listeners, hydrate);

    return {
        subscribe,
        getSnapshot: (): RoleState => state,
    };
}

const store = createRoleStore();

export interface PhoneRole {
    /** Nothing role-specific may draw before this: the alternative is a frame of the wrong view. */
    hydrated: boolean;
    /** Which day screen and which Settings rows. */
    role: ClientRole;
    /** The role an admin granted this phone. Null until it has scanned a code. */
    granted: Role | null;
}

export function resolveRole(
    legacy: RoleState,
    credential: Credential | null,
    credentialReady: boolean,
): PhoneRole {
    return {
        hydrated: legacy.hydrated && credentialReady,
        role: credential ? viewOf(credential.role) : legacy.role,
        granted: credential?.role ?? null,
    };
}

/** The view a phone with no credential was left on. `useRole` is what screens read. */
export function useLegacyRole(): RoleState {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
