import { WS_EVENT, type WsEvent } from '@mawid/shared';
import { useEffect } from 'react';
import { api } from './client';
import { timing, wsUrl } from './config';
import { resolveBaseUrl } from './connection';
import { queryClient } from './queryClient';

// `/ws` tells this phone what the other phone changed (SPEC §13). Payloads carry
// IDs only — no patient data crosses the channel — so every event does the same
// thing: invalidate what it touched and let React Query refetch through tRPC.
// One socket for the app's lifetime, reconnecting with backoff while the clinic
// PC is down; it is a freshness optimisation on top of the query cache, never a
// data path. A malformed frame is ignored rather than crashing the app.
function invalidate(event: WsEvent): void {
    switch (event) {
        case WS_EVENT.APPOINTMENT_CREATED:
        case WS_EVENT.APPOINTMENT_UPDATED:
            void queryClient.invalidateQueries(api.appointment.pathFilter());
            void queryClient.invalidateQueries(api.reminder.pathFilter());
            void queryClient.invalidateQueries(api.stats.pathFilter());
            return;
        case WS_EVENT.VISIT_UPDATED:
            void queryClient.invalidateQueries(api.visit.pathFilter());
            void queryClient.invalidateQueries(api.balance.pathFilter());
            void queryClient.invalidateQueries(api.patient.pathFilter());
            void queryClient.invalidateQueries(api.appointment.pathFilter());
            void queryClient.invalidateQueries(api.stats.pathFilter());
            return;
        case WS_EVENT.SETTINGS_UPDATED:
            void queryClient.invalidateQueries(api.settings.pathFilter());
            return;
    }
}

function isWsEvent(value: unknown): value is WsEvent {
    return Object.values(WS_EVENT).includes(value as WsEvent);
}

function connect(onEvent: (event: WsEvent) => void): () => void {
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

        const next = new WebSocket(wsUrl(base));
        socket = next;

        next.onopen = () => {
            delay = timing.reconnectMinMs;
        };
        next.onmessage = (message) => {
            try {
                const payload: unknown = JSON.parse(String(message.data));
                const event = (payload as { event?: unknown } | null)?.event;
                if (isWsEvent(event)) onEvent(event);
            } catch {}
        };
        next.onerror = () => next.close();
        next.onclose = () => {
            if (socket === next) socket = null;
            schedule();
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
    useEffect(() => connect(invalidate), []);
}
