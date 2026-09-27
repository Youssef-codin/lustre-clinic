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
 * A view kept on the phone. Two of them: the one a phone with no credential was
 * left on (read, never written), and the admin's choice of which day to look at
 * (`ADMIN_VIEW_KEY`) — screens only, the server still treats it as the admin.
 *
 * Exported for the tests, which need the thing a cold launch produces: a store
 * that has never read storage. The module keeps one instance of each and that
 * is what the app uses.
 */
export function createRoleStore(key = ROLE_KEY, fallback: ClientRole = FALLBACK_ROLE) {
    let state: RoleState = { hydrated: false, role: fallback };
    const listeners = new Set<() => void>();

    function emit(next: RoleState): void {
        state = next;
        for (const listener of listeners) listener();
    }

    // A choice made while the read was still out is this phone's answer, and
    // the stored value is the question it just answered.
    let chosen = false;

    async function hydrate(): Promise<void> {
        const stored = await AsyncStorage.getItem(key).catch(() => null);
        if (chosen) return;
        emit({ hydrated: true, role: isRole(stored) ? stored : fallback });
    }

    const subscribe = hydratingSubscribe(listeners, hydrate);

    return {
        subscribe,
        getSnapshot: (): RoleState => state,
        set(next: ClientRole): void {
            chosen = true;
            emit({ hydrated: true, role: next });
            void AsyncStorage.setItem(key, next).catch(() => undefined);
        },
    };
}

const ADMIN_VIEW_KEY = 'lustre.admin.view';

const store = createRoleStore();
// The doctor's day first: the admin is the clinic's owner.
const adminView = createRoleStore(ADMIN_VIEW_KEY, 'doctor');

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
    admin: RoleState,
    credential: Credential | null,
    credentialReady: boolean,
): PhoneRole {
    const role = credential
        ? credential.role === 'admin'
            ? admin.role
            : viewOf(credential.role)
        : legacy.role;
    return {
        hydrated: legacy.hydrated && admin.hydrated && credentialReady,
        role,
        granted: credential?.role ?? null,
    };
}

export function useAdminView(): RoleState {
    return useSyncExternalStore(adminView.subscribe, adminView.getSnapshot);
}

/** The admin's switch between the doctor's and the desk's day. Screens only. */
export function setAdminView(next: ClientRole): void {
    adminView.set(next);
}

/** The view a phone with no credential was left on. `useRole` is what screens read. */
export function useLegacyRole(): RoleState {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
