import { ERROR_CODE, type Role } from '@lustre/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { noteDataReset, subscribeToDataReset } from './dataReset';
import { isDemoMode } from './demo/flag';

// This phone's role credential: what an admin's QR code was redeemed for. The
// token goes out on every request and on `/ws`, and the server reads the role
// off it — the copy of the role kept here is only for drawing the right
// screens, never for deciding what the phone may do.
//
// Two slots, because demo mode is a second server: a credential the demo handed
// out means nothing to the clinic's, and the clinic's must survive a demo being
// entered and left. Each is persisted under its own key.
//
// A refusal is the server saying this phone may not in: `revoked` when an admin
// withdrew its role (persisted, so a relaunch does not quietly fall back to the
// access a phone with no role still has), `unprovisioned` when the clinic
// requires a role and this phone has none (not persisted: turning the
// requirement off again has to be enough), and `new` for a phone installed
// since roles existed, which opens on the scanner rather than on the access a
// phone with no role otherwise keeps (persisted until a code is redeemed).
// Only the phones that predate roles skip that, which is the upgrade path.

export interface Credential {
    token: string;
    deviceId: string;
    role: Role;
    label: string;
}

export type Refusal = 'none' | 'new' | 'unprovisioned' | 'revoked';

export interface CredentialState {
    hydrated: boolean;
    credential: Credential | null;
    refusal: Refusal;
}

interface Slot {
    credential: Credential | null;
    revoked: boolean;
    unprovisioned: boolean;
    fresh: boolean;
}

type SlotName = 'live' | 'demo';

const KEYS: Record<SlotName, string> = { live: 'lustre.device', demo: 'lustre.demo.device' };

const EMPTY: Slot = { credential: null, revoked: false, unprovisioned: false, fresh: false };

function parseSlot(stored: string | null): Slot {
    if (!stored) return EMPTY;
    try {
        const value = JSON.parse(stored) as Partial<{
            credential: Credential | null;
            revoked: boolean;
            fresh: boolean;
        }>;
        const credential = value.credential;
        const valid =
            credential &&
            typeof credential.token === 'string' &&
            typeof credential.deviceId === 'string' &&
            typeof credential.role === 'string';
        return {
            credential: valid ? credential : null,
            revoked: value.revoked === true,
            unprovisioned: false,
            fresh: value.fresh === true,
        };
    } catch {
        return EMPTY;
    }
}

/**
 * The two refusal codes in a tRPC response body, batched or not. The body is
 * read for `appCode` only — the client switches on codes, never on messages.
 */
export function refusalIn(body: unknown): 'revoked' | 'unprovisioned' | null {
    const entries = Array.isArray(body) ? body : [body];
    let found: 'revoked' | 'unprovisioned' | null = null;
    for (const entry of entries) {
        const code = (entry as { error?: { data?: { appCode?: unknown } } } | null)?.error?.data?.appCode;
        if (code === ERROR_CODE.DEVICE_REVOKED) return 'revoked';
        if (code === ERROR_CODE.DEVICE_NOT_PROVISIONED) found = 'unprovisioned';
    }
    return found;
}

/** Exported for the tests, which need a store that has never read storage. */
export function createCredentialStore(inDemo: () => boolean = isDemoMode) {
    const slots: Record<SlotName, Slot> = { live: EMPTY, demo: EMPTY };
    let hydrated = false;
    let snapshot: CredentialState = { hydrated: false, credential: null, refusal: 'none' };
    const listeners = new Set<() => void>();
    const current = (): SlotName => (inDemo() ? 'demo' : 'live');

    function emit(): void {
        const slot = slots[current()];
        const refusal: Refusal = slot.revoked
            ? 'revoked'
            : slot.unprovisioned
              ? 'unprovisioned'
              : slot.fresh && !slot.credential
                ? 'new'
                : 'none';
        const next = { hydrated, credential: slot.credential, refusal };
        if (
            next.hydrated === snapshot.hydrated &&
            next.credential === snapshot.credential &&
            next.refusal === snapshot.refusal
        ) {
            return;
        }
        snapshot = next;
        for (const listener of listeners) listener();
    }

    // Written before the read lands wins over it, as `roleStore` does.
    const touched = new Set<SlotName>();

    function write(name: SlotName, slot: Slot): void {
        slots[name] = slot;
        touched.add(name);
        const persisted = JSON.stringify({
            credential: slot.credential,
            revoked: slot.revoked,
            fresh: slot.fresh,
        });
        void AsyncStorage.setItem(KEYS[name], persisted).catch(() => undefined);
        emit();
    }

    let hydrating: Promise<void> | null = null;

    function hydrate(): Promise<void> {
        hydrating ??= (async () => {
            const [live, demo] = await Promise.all(
                (['live', 'demo'] as const).map((name) => AsyncStorage.getItem(KEYS[name]).catch(() => null)),
            );
            if (!touched.has('live')) slots.live = parseSlot(live ?? null);
            if (!touched.has('demo')) slots.demo = parseSlot(demo ?? null);
            hydrated = true;
            emit();
        })();
        return hydrating;
    }

    // Entering or leaving demo mode is reported as a data reset, and it is also
    // what changes which slot is current.
    subscribeToDataReset(emit);

    return {
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            void hydrate();
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot: (): CredentialState => snapshot,
        hydrate,
        token: (): string | null => slots[current()].credential?.token ?? null,
        grant(credential: Credential): void {
            write(current(), { credential, revoked: false, unprovisioned: false, fresh: false });
        },
        /**
         * `sentWith` is the token the refused request carried. A refusal for a
         * credential this phone has since replaced is about the old one, and
         * must not throw the new one away.
         */
        refuse(kind: 'revoked' | 'unprovisioned', sentWith: string | null): void {
            const name = current();
            const slot = slots[name];
            if ((slot.credential?.token ?? null) !== sentWith) return;
            if (kind === 'revoked') {
                write(name, { credential: null, revoked: true, unprovisioned: false, fresh: false });
                return;
            }
            if (slot.credential || slot.unprovisioned) return;
            slots[name] = { ...slot, unprovisioned: true };
            emit();
        },
        /** "Try again" on the unprovisioned screen: the next request finds out whether it still applies. */
        retry(): void {
            const name = current();
            slots[name] = { ...slots[name], unprovisioned: false };
            emit();
        },
        forgetDemo(): void {
            write('demo', EMPTY);
        },
        /** Waits for storage, so a credential already on the phone is never mistaken for none. */
        async markFresh(): Promise<void> {
            await hydrate();
            const slot = slots.live;
            if (slot.credential || slot.fresh) return;
            write('live', { ...slot, fresh: true });
        },
    };
}

const store = createCredentialStore();

export function useCredential(): CredentialState {
    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** The token for the server the next request goes to, or null. Read per request. */
export function credentialToken(): string | null {
    return store.token();
}

/** Before the first request goes out: a provisioned phone must not send one bare. */
export function hydrateCredential(): Promise<void> {
    return store.hydrate();
}

/** A code was redeemed. Everything cached was fetched as the phone's old self, so it goes. */
export function grantCredential(credential: Credential): void {
    store.grant(credential);
    noteDataReset();
}

export function noteRefusal(kind: 'revoked' | 'unprovisioned', sentWith: string | null): void {
    const before = store.getSnapshot();
    store.refuse(kind, sentWith);
    if (store.getSnapshot().credential !== before.credential) noteDataReset();
}

/** Everything behind the refusal failed; clearing it is what makes the screens ask again. */
export function retryProvisioning(): void {
    store.retry();
    noteDataReset();
}

/**
 * This install has never known a clinic server (`shell/serverStore`): it was
 * installed since roles existed, so it asks for a code before anything else.
 */
export function markFreshInstall(): Promise<void> {
    return store.markFresh();
}

/** A reseeded demo has no devices, so the demo's credential goes with it. */
export function forgetDemoCredential(): void {
    store.forgetDemo();
}
