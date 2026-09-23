// biome-ignore lint/style/noRestrictedImports: opens the `/ws` socket and closes it on cleanup — the subscription case this hook exists for
import { useEffect } from 'react';
import { noteLive } from '../reporting/trail';
import { api } from './client';
import { timing, wsUrl } from './config';
import { noteLinkDropped, resolveBaseUrl } from './connection';
import { subscribeToDemoEvents, useDemoMode } from './demo';
import { queryClient } from './queryClient';
import { createEventCursor, createRefreshBatch, type ServerEvent } from './serverEvents';

// `/ws` tells this phone what the other phone changed (SPEC §13). Payloads carry
// IDs only — no patient data crosses the channel — so every event does the same
// thing: invalidate what it touched and let React Query refetch through tRPC.
// One socket for the app's lifetime, reconnecting with backoff while the clinic
// PC is down; it is a freshness optimisation on top of the query cache, never a
// data path. A malformed frame is ignored rather than crashing the app.
//
// The cursor outlives the socket, so a reconnect resumes where the last one
// stopped and the server replays what was missed (`serverEvents.ts`).
const cursor = createEventCursor();

const refresh = createRefreshBatch((areas) => {
    if (areas === 'all') {
        void queryClient.invalidateQueries();
        return;
    }
    for (const area of areas) void queryClient.invalidateQueries(api[area].pathFilter());
});

const listeners = new Set<(event: ServerEvent) => void>();

/** Every event the cursor applied, after its refetch has been asked for. Not called in demo mode. */
export function onServerEvent(listener: (event: ServerEvent) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function receive(frame: unknown): void {
    const step = cursor.read(frame);
    if (step.outcome !== 'ignored') noteLive(step.event?.event ?? 'hello', step.outcome);
    if (step.resync) refresh('all');
    if (!step.event) return;
    refresh(step.event.event);
    for (const listener of listeners) listener(step.event);
}

function connect(): () => void {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let delay: number = timing.reconnectMinMs;
    let closed = false;

    const schedule = () => {
        if (closed || retry) return;
        retry = setTimeout(() => {
            retry = null;
            void open();
        }, delay);
        delay = Math.min(delay * 2, timing.reconnectMaxMs);
    };

    const open = async () => {
        if (closed) return;

        let base: string;
        try {
            base = await resolveBaseUrl();
        } catch {
            schedule();
            return;
        }
        if (closed) return;

        const next = new WebSocket(`${wsUrl(base)}${cursor.resumeQuery()}`);
        socket = next;

        next.onopen = () => {
            delay = timing.reconnectMinMs;
        };
        next.onmessage = (message) => {
            let frame: unknown;
            try {
                frame = JSON.parse(String(message.data));
            } catch {
                return;
            }
            receive(frame);
        };
        next.onerror = () => next.close();
        next.onclose = () => {
            if (socket === next) socket = null;
            if (closed) return;
            schedule();
            // Not a freshness matter, unlike everything else here: a socket
            // that closes on its own is the first sign the clinic PC is gone,
            // and the connection state is what the shell's disconnected route
            // reads. It probes before believing it (`noteLinkDropped`).
            noteLinkDropped();
        };
    };

    void open();

    return () => {
        closed = true;
        if (retry) clearTimeout(retry);
        socket?.close();
        socket = null;
    };
}

export function useServerEvents(): void {
    // Demo mode has no socket to open, but it has the same events: the handlers
    // announce them locally (`demo/events.ts`) and they drive the same
    // invalidation, so the money dashboard refreshes after a payment there for
    // the same reason it does here.
    //
    // A dependency rather than a read at mount. This hook is mounted by
    // `ApiProvider`, which is above both the setup screen and the shell, so it
    // is already running when somebody taps "Run in demo mode" — asking once
    // would leave that session subscribed to a socket that will never open and
    // deaf to the events it does get, until the app was next launched.
    const { enabled } = useDemoMode();

    useEffect(() => (enabled ? subscribeToDemoEvents(refresh) : connect()), [enabled]);
}
