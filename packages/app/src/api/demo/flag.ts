/**
 * Whether this launch is a demo, and nothing else.
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
 * The getter is synchronous because the tRPC link asks it per request and a
 * link is not a component. Hydration is started by the first subscriber, the
 * same shape as `shell/serverStore.ts`, so nothing touches the native module
 * on the import path.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';

const DEMO_KEY = 'lustre.demo';

interface DemoExtra {
    demo?: unknown;
}

const extra = (Constants.expoConfig?.extra ?? {}) as DemoExtra;

/** The build's own answer, and the floor: a build that ships `true` is a demo build. */
const shipped = extra.demo === true;

interface DemoState {
    hydrated: boolean;
    enabled: boolean;
}

let state: DemoState = { hydrated: shipped, enabled: shipped };

const listeners = new Set<() => void>();
let hydrating = false;

function emit(next: DemoState): void {
    if (next.hydrated === state.hydrated && next.enabled === state.enabled) return;
    state = next;
    for (const listener of listeners) listener();
}

export function isDemoMode(): boolean {
    return state.enabled;
}

function getSnapshot(): DemoState {
    return state;
}

async function hydrate(): Promise<void> {
    const stored = await AsyncStorage.getItem(DEMO_KEY).catch(() => null);
    emit({ hydrated: true, enabled: shipped || stored === 'on' });
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

export interface DemoMode extends DemoState {
    enable: () => Promise<void>;
    disable: () => Promise<void>;
}

export function useDemoMode(): DemoMode {
    const current = useSyncExternalStore(subscribe, getSnapshot);
    return { ...current, enable: enableDemoMode, disable: disableDemoMode };
}

export async function enableDemoMode(): Promise<void> {
    emit({ hydrated: true, enabled: true });
    await AsyncStorage.setItem(DEMO_KEY, 'on').catch(() => undefined);
}

/**
 * A build that shipped `extra.demo` stays a demo: clearing the flag would leave
 * it pointed at a server it was never given an address for.
 */
export async function disableDemoMode(): Promise<void> {
    if (shipped) return;
    emit({ hydrated: true, enabled: false });
    await AsyncStorage.removeItem(DEMO_KEY).catch(() => undefined);
}
