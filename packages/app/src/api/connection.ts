import { AppState, type NativeEventSubscription } from 'react-native';
import { serverAddresses, timing, trpcUrl } from './config';

/**
 * Which address answered, whether it is still answering, and how old the last
 * answer is (SPEC §14). Everything that talks to the server goes through
 * `resolveBaseUrl`, and every request reports its outcome back here, so the
 * connection state is a record of real traffic rather than a separate poller.
 *
 * The state is a plain store rather than React state because the tRPC link
 * needs it and the link is not a component. `useConnection` subscribes.
 */

export type ConnectionStatus =
    /** Nothing has been tried yet — first launch, or straight after a reset. */
    | 'unknown'
    /** A probe is in flight. */
    | 'probing'
    /** The server answered. */
    | 'online'
    /** Neither address answered. Reads fall back to cache; writes fail (§14). */
    | 'offline';

export type AddressKind = 'lan' | 'tailscale';

export interface ConnectionState {
    status: ConnectionStatus;
    /** The address in use, once one has answered. */
    baseUrl: string | null;
    /** Which of the two it is — the settings screen shows this. */
    address: AddressKind | null;
    /** Epoch ms of the last successful exchange, or null if there has not been one. */
    lastOnlineAt: number | null;
    /**
     * What is on screen may not match the server: either we are offline, or the
     * last successful exchange is older than `timing.staleAfterMs`. Sync
     * indicators read this; it is not an error state.
     */
    isStale: boolean;
}

/** Thrown when neither address answers. Classified as `offline` by `classifyError`. */
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

/**
 * `getSnapshot` has to return the same object until something changes, so
 * staleness cannot be computed on read — it is scheduled instead. One timer,
 * rearmed on every successful exchange.
 */
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

/** Called by the link on every response the server produced, including 4xx and 5xx. */
export function markOnline(): void {
    armStaleTimer();
    emit({ status: 'online', lastOnlineAt: Date.now(), isStale: false });
}

/**
 * Called when a request never reached a server. The base URL is dropped so the
 * next call probes again — that is what handles the phone moving between the
 * clinic wifi and the tailnet without a network-change listener.
 */
export function markOffline(): void {
    emit({ status: 'offline', baseUrl: null, address: null, isStale: true });
}

// --- probing ----------------------------------------------------------------

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

/**
 * `health.check` takes no input, so a bare GET is a valid tRPC query. Any
 * response at all means something is listening; the body is not read, because
 * `db: false` still means the machine is up and the error belongs to the
 * procedure that hits it.
 */
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

    // In order, not in parallel (§14): the LAN address is the better one when it
    // works, and its 500ms ceiling is cheap enough to always try first.
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

/**
 * The address for this request. Cached for the session (§14) and re-probed only
 * after a failure, so the 500ms LAN attempt is paid once rather than per call.
 */
export function resolveBaseUrl(): Promise<string> {
    if (state.baseUrl && state.status === 'online') return Promise.resolve(state.baseUrl);
    if (inFlight) return inFlight;

    inFlight = probeBoth().finally(() => {
        inFlight = null;
    });
    return inFlight;
}

/** The Retry button on the offline banner and in settings. */
export async function reprobe(): Promise<boolean> {
    emit({ baseUrl: null, address: null });
    try {
        await resolveBaseUrl();
        return true;
    } catch {
        return false;
    }
}

// --- foreground ---------------------------------------------------------------

// A phone that has been in a pocket for an hour is the common case, and the
// wifi it comes back on may not be the clinic's. Coming to the foreground while
// not online re-probes; while online, the next request settles it either way.
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
