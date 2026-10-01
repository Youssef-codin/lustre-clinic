/**
 * Whether this launch answers from the phone itself, and as which clinic.
 *
 * Two backends live on the phone. The demo is an invented clinic, and the rest
 * of this note is about why it is hard to reach. Local mode is a real one: the
 * clinic that has no server, whose records live on this phone alone (`./local`).
 * It is allowed on every build, prod included, because it is a clinic's own
 * choice rather than a register standing in for one. Neither is ever entered
 * because a probe failed.
 *
 * Demo mode replaces the clinic server with an in-memory copy of it
 * (`./backend`). That is a useful thing to hand someone across a table and a
 * dangerous thing to reach by accident: the fake register would look like the
 * real one, and every write the desk made would go nowhere. So it is only ever
 * entered deliberately — `app.json`'s `extra.demo`, which ships `false`, or the
 * button on the setup screen — and never as a fallback from a probe that
 * failed. A clinic whose server is off gets the offline screen, which is the
 * truth, rather than a working-looking app over invented patients.
 *
 * A prod build has no way in at all (`../variant`), and clears a flag an
 * earlier dev or demo install left in storage rather than obeying it.
 *
 * The getter is synchronous because the tRPC link asks it per request and a
 * link is not a component. Hydration is started by the first subscriber, the
 * same shape as `shell/serverStore.ts`, so nothing touches the native module
 * on the import path.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { BUILD_VARIANT } from '../config';
import { noteDataReset } from '../dataReset';
import { allowsDemo } from '../variant';

const DEMO_KEY = 'lustre.demo';
const LOCAL_KEY = 'lustre.local';

interface DemoExtra {
    demo?: unknown;
}

const extra = (Constants.expoConfig?.extra ?? {}) as DemoExtra;

/** The build's own answer, and the floor: a build that ships `true` is a demo build. */
const shipped = extra.demo === true;

/** What answers instead of a server: the invented clinic, or this phone's own. */
export type DeviceBackend = 'demo' | 'local';

interface BackendState {
    hydrated: boolean;
    backend: DeviceBackend | null;
}

let state: BackendState = { hydrated: shipped, backend: shipped ? 'demo' : null };

const listeners = new Set<() => void>();
let hydrating = false;

/**
 * Bumped by every explicit enable/disable. A hydration read that began before
 * one of those has an answer from before the change, and applying it would put
 * the flag back — the setup screen's demo button turning itself off a moment
 * after it was pressed.
 */
let transitions = 0;

function emit(next: BackendState): void {
    if (next.hydrated === state.hydrated && next.backend === state.backend) return;
    state = next;
    for (const listener of listeners) listener();
}

/** Switches the backend: everything cached came from the other one. */
function become(backend: DeviceBackend | null): void {
    transitions += 1;
    const changed = state.backend !== backend;
    emit({ hydrated: true, backend });
    if (changed) noteDataReset();
}

export function isDemoMode(): boolean {
    return state.backend === 'demo';
}

export function isLocalMode(): boolean {
    return state.backend === 'local';
}

/** Null while requests go to a clinic server. */
export function deviceBackend(): DeviceBackend | null {
    return state.backend;
}

function getSnapshot(): BackendState {
    return state;
}

async function hydrate(): Promise<void> {
    const before = transitions;
    const [demo, local] = await Promise.all(
        [DEMO_KEY, LOCAL_KEY].map((key) => AsyncStorage.getItem(key).catch(() => null)),
    );
    if (!allowsDemo(BUILD_VARIANT)) await AsyncStorage.removeItem(DEMO_KEY).catch(() => undefined);
    if (transitions !== before) return;

    const demoOn = allowsDemo(BUILD_VARIANT) && (shipped || demo === 'on');
    const backend: DeviceBackend | null = shipped
        ? 'demo'
        : local === 'on'
          ? 'local'
          : demoOn
            ? 'demo'
            : null;
    emit({ hydrated: true, backend });
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

export function useDeviceBackend(): BackendState {
    return useSyncExternalStore(subscribe, getSnapshot);
}

export interface DemoMode {
    hydrated: boolean;
    enabled: boolean;
    enable: () => Promise<void>;
    disable: () => Promise<void>;
}

export function useDemoMode(): DemoMode {
    const current = useDeviceBackend();
    return {
        hydrated: current.hydrated,
        enabled: current.backend === 'demo',
        enable: enableDemoMode,
        disable: disableDemoMode,
    };
}

/** A removal that fails would leave `on` behind, so the key is overwritten instead; hydration reads only `on`. */
function clearKey(key: string): Promise<void> {
    return AsyncStorage.removeItem(key)
        .catch(() => AsyncStorage.setItem(key, 'off'))
        .catch(() => undefined);
}

export async function enableDemoMode(): Promise<void> {
    if (!allowsDemo(BUILD_VARIANT) || state.backend === 'local') return;
    become('demo');
    await AsyncStorage.setItem(DEMO_KEY, 'on').catch(() => undefined);
}

/**
 * A build that shipped `extra.demo` stays a demo: clearing the flag would leave
 * it pointed at a server it was never given an address for.
 */
export async function disableDemoMode(): Promise<void> {
    if (shipped || state.backend !== 'demo') return;
    become(null);
    await clearKey(DEMO_KEY);
}

/**
 * Written before the switch, not after: a phone that showed its clinic as
 * local and relaunched into the setup screen would look like it had lost it.
 */
export async function enableLocalMode(): Promise<void> {
    if (shipped) return;
    await AsyncStorage.setItem(LOCAL_KEY, 'on');
    await clearKey(DEMO_KEY);
    become('local');
}

/** The records stay on the phone (`./local`), so entering again opens the same clinic. */
export async function disableLocalMode(): Promise<void> {
    if (state.backend !== 'local') return;
    become(null);
    await clearKey(LOCAL_KEY);
}
