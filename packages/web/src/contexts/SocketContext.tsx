import type { ServerEvent, ServerEventName, ServerEvents } from '@mawid/shared';
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

type Listener<E extends ServerEventName> = (payload: ServerEvents[E]) => void;

interface SocketValue {
    connected: boolean;
    subscribe: <E extends ServerEventName>(event: E, listener: Listener<E>) => () => void;
}

const SocketContext = createContext<SocketValue | null>(null);

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

/**
 * One connection, opened at the app root and shared through context. Events
 * update state directly — nothing in this app polls. See spec §2.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
    const [connected, setConnected] = useState(false);
    const listeners = useRef(new Map<ServerEventName, Set<Listener<ServerEventName>>>());

    useEffect(() => {
        let socket: WebSocket | null = null;
        let retryMs = RECONNECT_MIN_MS;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        let closed = false;

        const connect = () => {
            const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
            socket = new WebSocket(`${scheme}://${window.location.host}/ws`);

            socket.onopen = () => {
                retryMs = RECONNECT_MIN_MS;
                setConnected(true);
            };

            socket.onmessage = (raw: MessageEvent<string>) => {
                let message: ServerEvent;
                try {
                    message = JSON.parse(raw.data) as ServerEvent;
                } catch {
                    return;
                }
                for (const listener of listeners.current.get(message.event) ?? []) {
                    listener(message.payload);
                }
            };

            socket.onclose = () => {
                setConnected(false);
                if (closed) return;
                // The clinic PC gets restarted; the desk screen must come back on its own.
                retryTimer = setTimeout(connect, retryMs);
                retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
            };

            socket.onerror = () => socket?.close();
        };

        connect();

        return () => {
            closed = true;
            clearTimeout(retryTimer);
            socket?.close();
        };
    }, []);

    const subscribe = useCallback(<E extends ServerEventName>(event: E, listener: Listener<E>) => {
        const set = listeners.current.get(event) ?? new Set();
        listeners.current.set(event, set);
        set.add(listener as Listener<ServerEventName>);
        return () => set.delete(listener as Listener<ServerEventName>);
    }, []);

    const value = useMemo(() => ({ connected, subscribe }), [connected, subscribe]);

    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketValue {
    const value = useContext(SocketContext);
    if (!value) throw new Error('useSocket must be used inside <SocketProvider>');
    return value;
}

/** Subscribe to one event for the lifetime of a component. */
export function useServerEvent<E extends ServerEventName>(event: E, listener: Listener<E>): void {
    const { subscribe } = useSocket();
    const ref = useRef(listener);
    ref.current = listener;

    useEffect(() => subscribe(event, (payload) => ref.current(payload)), [event, subscribe]);
}
