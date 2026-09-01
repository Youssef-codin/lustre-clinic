import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { reprobe, type ServerAddresses, serverAddresses, setServerAddresses, trpcClient } from '../api';

// Where the addresses collected by setup are kept. `api/config` holds no
// storage of its own by design (§14, "persisting what onboarding collected
// belongs with onboarding"), so this is the only thing that survives a launch.
//
// Two plain string keys rather than one JSON blob: a half-written value then
// comes back as a bad address the probe rejects, instead of a parse that throws
// on the boot path. Hydration is started by the first subscriber rather than at
// import, so nothing touches the native module until something renders.
const LAN_KEY = 'lustre.server.lan';
const TAILSCALE_KEY = 'lustre.server.tailscale';

// What the boot sequence is waiting on. A default is probed rather than
// trusted: one address is shipped to every clinic, so it is right for the one
// it was written for and wrong everywhere else, and the only honest way to
// tell the two apart is to ask the network. The shipped `app.json` sets none,
// which is not a probe that failed but a question nobody has answered yet —
// `hydrate` skips the network for it and goes straight to setup.
type DefaultProbe = 'probing' | 'reachable' | 'unreachable';

export interface SetupState {
    hydrated: boolean;
    addresses: ServerAddresses;
    /** True once an address has come back from storage — a real setup, not a default. */
    stored: boolean;
    defaultProbe: DefaultProbe;
    reconfiguring: boolean;
}

export interface ServerSetup extends SetupState {
    /** Nothing may render before this: the alternative is a flash of the wrong screen. */
    ready: boolean;
    showSetup: boolean;
}

let state: SetupState = {
    hydrated: false,
    addresses: serverAddresses(),
    stored: false,
    defaultProbe: 'probing',
    reconfiguring: false,
};
const listeners = new Set<() => void>();
let hydrating = false;

function emit(next: SetupState): void {
    state = next;
    for (const listener of listeners) listener();
}

// `setServerAddresses` merges each side with `??`, so passing `null` leaves the
// old value in place and only an empty string can clear one. Every write goes
// through here so that lives in one spot.
export function applyAddresses(next: ServerAddresses): void {
    setServerAddresses({ lan: next.lan ?? '', tailscale: next.tailscale ?? '' });
}

async function hydrate(): Promise<void> {
    const entries = await AsyncStorage.multiGet([LAN_KEY, TAILSCALE_KEY]).catch(() => null);

    const restored: ServerAddresses = { lan: null, tailscale: null };
    for (const [key, value] of entries ?? []) {
        if (key === LAN_KEY) restored.lan = value || null;
        if (key === TAILSCALE_KEY) restored.tailscale = value || null;
    }

    // A stored pair is this phone's own answer and is never second-guessed: if
    // it stops working that is the offline screen's business, not setup's.
    // Re-running the probe here would send a phone whose clinic is merely
    // switched off back to a screen asking it to retype an address that was
    // already right.
    if (restored.lan || restored.tailscale) {
        applyAddresses(restored);
        emit({ ...state, hydrated: true, addresses: serverAddresses(), stored: true });
        return;
    }

    const fallback = serverAddresses();
    emit({ ...state, hydrated: true, addresses: fallback, stored: false });

    // The shipped build's own path: nothing to probe, so setup opens on empty
    // fields rather than on a failure report for an address nobody chose.
    if (!fallback.lan && !fallback.tailscale) {
        emit({ ...state, defaultProbe: 'unreachable' });
        return;
    }

    const reachable = await reprobe();
    if (!reachable) {
        emit({ ...state, defaultProbe: 'unreachable' });
        return;
    }

    // The shipped default answered, so this phone is configured without anyone
    // having touched it: write down the address that worked, along with the
    // tailnet address the server reports, and it is set up for good.
    //
    // The cost of writing it down is that a later build shipping a different
    // default will not be probed on a phone that already stored one — moving
    // the clinic server means the handsets go offline and are pointed at the
    // new address through "Change server address", not by an app update.
    await saveServerAddresses({ lan: fallback.lan, tailscale: await learnTailnetAddress() });
    emit({ ...state, defaultProbe: 'reachable' });
}

// The clinic server knows its own tailnet address (§14) and reports it on
// `health.check`, so nobody types it into a handset. It is re-read on every
// successful connection rather than only at setup: that is what makes moving
// the server one change on the clinic PC instead of a visit to every phone.
//
// A server that reports nothing leaves whatever is already stored alone — an
// older build that does not send the field must not wipe an address that works.
export async function learnTailnetAddress(): Promise<string | null> {
    const report = await trpcClient.health.check.query().catch(() => null);
    const reported = report?.tailscale?.trim();
    return reported ? reported : null;
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

function getSnapshot(): SetupState {
    return state;
}

export function useServerSetup(): ServerSetup {
    const current = useSyncExternalStore(subscribe, getSnapshot);
    // Setup is for a phone that has never reached this clinic. One that has —
    // by its own stored address or by the shipped default answering — goes to
    // the app, and a server that is down from there is the offline screen.
    const settled = current.stored || current.defaultProbe !== 'probing';
    return {
        ...current,
        ready: current.hydrated && settled,
        showSetup: current.reconfiguring || (!current.stored && current.defaultProbe === 'unreachable'),
    };
}

// The way back to setup from the offline dead end. Without it a saved typo is
// unrecoverable: every launch resolves the bad address, fails, and lands on a
// screen whose only control is Try again. The stored values are left alone so
// setup opens on them and the user edits rather than retypes.
export function requestReconfigure(): void {
    emit({ ...state, reconfiguring: true });
}

export async function saveServerAddresses(next: ServerAddresses): Promise<void> {
    applyAddresses(next);
    const addresses = serverAddresses();
    emit({
        ...state,
        hydrated: true,
        addresses,
        stored: true,
        defaultProbe: 'reachable',
        reconfiguring: false,
    });

    // A failed write costs the user one re-entry on the next launch, which is
    // not worth refusing a connection that has just been proven to work.
    await AsyncStorage.multiSet([
        [LAN_KEY, addresses.lan ?? ''],
        [TAILSCALE_KEY, addresses.tailscale ?? ''],
    ]).catch(() => undefined);
}
