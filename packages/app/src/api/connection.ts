import { AppState, type NativeEventSubscription } from 'react-native';
import { serverAddresses, timing, trpcUrl } from './config';

// Connection state is a record of real traffic, not a poller: every request
// reports its outcome back here through the tRPC link (markOnline/markOffline).
// It is a plain store rather than React state because the link is not a
// component; `useConnection` subscribes.
//
// The base URL is cached for the session and dropped on failure so the next
// call probes again — that is how the phone moves between clinic wifi and the
// tailnet with no network-change listener. Probes run sequentially, LAN first
// (§14), and a bare GET on `health.check` counts as "online" without reading
// the body. Staleness is scheduled rather than computed on read because
// `getSnapshot` must return the same object until something changes.
export type ConnectionStatus = 'unknown' | 'probing' | 'online' | 'offline';

export type AddressKind = 'lan' | 'tailscale';

export interface ConnectionState {
    status: ConnectionStatus;
    baseUrl: string | null;
    address: AddressKind | null;
    lastOnlineAt: number | null;
    isStale: boolean;
}

export class ServerUnreachableError extends Error {
    constructor(message = 'The clinic server did not answer on either address') {
        super(message);
        this.name = 'ServerUnreachableError';
    }
}

let state: ConnectionState = {
    status: 'unknown',
    baseUrl: null,
    address: null,
    lastOnlineAt: null,
    isStale: true,
};

const listeners = new Set<() => void>();
let staleTimer: ReturnType<typeof setTimeout> | null = null;

function emit(next: Partial<ConnectionState>): void {
    const merged = { ...state, ...next };
    if (
        merged.status === state.status &&
        merged.baseUrl === state.baseUrl &&
        merged.address === state.address &&
        merged.lastOnlineAt === state.lastOnlineAt &&
        merged.isStale === state.isStale
    ) {
        return;
    }
    state = merged;
    for (const listener of listeners) listener();
}

function armStaleTimer(): void {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => emit({ isStale: true }), timing.staleAfterMs);
}

export function getConnectionState(): ConnectionState {
    return state;
}

export function subscribeToConnection(listener: () => void): () => void {
    listeners.add(listener);
    if (listeners.size === 1) startForegroundWatch();
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopForegroundWatch();
    };
}

export function markOnline(): void {
    armStaleTimer();
    emit({ status: 'online', lastOnlineAt: Date.now(), isStale: false });
}

export function markOffline(): void {
    emit({ status: 'offline', baseUrl: null, address: null, isStale: true });
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const caller = init?.signal;
    const forward = () => controller.abort();
    caller?.addEventListener('abort', forward);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
        caller?.removeEventListener('abort', forward);
    }
}

async function probe(base: string, timeoutMs: number): Promise<boolean> {
    try {
        const response = await fetchWithTimeout(`${trpcUrl(base)}/health.check`, timeoutMs);
        return response.ok;
    } catch {
        return false;
    }
}

let inFlight: Promise<string> | null = null;

async function probeBoth(): Promise<string> {
    const { lan, tailscale } = serverAddresses();
    emit({ status: 'probing' });

    if (lan && (await probe(lan, timing.lanProbeMs))) {
        armStaleTimer();
        emit({ status: 'online', baseUrl: lan, address: 'lan', lastOnlineAt: Date.now(), isStale: false });
        return lan;
    }

    if (tailscale && (await probe(tailscale, timing.tailscaleProbeMs))) {
        armStaleTimer();
        emit({
            status: 'online',
            baseUrl: tailscale,
            address: 'tailscale',
            lastOnlineAt: Date.now(),
            isStale: false,
        });
        return tailscale;
    }

    markOffline();
    throw new ServerUnreachableError(lan || tailscale ? undefined : 'No server address is configured yet');
}

export function resolveBaseUrl(): Promise<string> {
    if (state.baseUrl && state.status === 'online') return Promise.resolve(state.baseUrl);
    if (inFlight) return inFlight;

    inFlight = probeBoth().finally(() => {
        inFlight = null;
    });
    return inFlight;
}

export async function reprobe(): Promise<boolean> {
    emit({ baseUrl: null, address: null });
    try {
        await resolveBaseUrl();
        return true;
    } catch {
        return false;
    }
}

/**
 * The `/ws` socket dropped (`live.ts`). Nothing else notices the clinic PC
 * going off until somebody makes a request, which is what left the shell on a
 * live-looking screen until whichever query she happened to run next timed out.
 * The socket is the app's earliest evidence and it is checked rather than
 * believed: this probes, and only the probe decides — a server that came back
 * within its own reconnect never reaches the disconnected route at all.
 *
 * Ignored unless the app is in front. Android closes the socket when the phone
 * is pocketed, and marking that offline would have her come back to a dead end
 * she never hit; the foreground watch below re-probes on the way in anyway.
 */
export function noteLinkDropped(): void {
    if (AppState.currentState !== 'active') return;
    if (state.status === 'probing') return;
    void reprobe();
}

let appStateSub: NativeEventSubscription | null = null;

function startForegroundWatch(): void {
    if (appStateSub) return;
    appStateSub = AppState.addEventListener('change', (next) => {
        if (next === 'active' && state.status !== 'online') void reprobe();
    });
}

function stopForegroundWatch(): void {
    appStateSub?.remove();
    appStateSub = null;
}
