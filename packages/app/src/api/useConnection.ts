import { useCallback, useSyncExternalStore } from 'react';
import { type ConnectionState, getConnectionState, reprobe, subscribeToConnection } from './connection';

export interface Connection extends ConnectionState {
    /** Convenience for the common three-way read. */
    isOnline: boolean;
    isOffline: boolean;
    /** Re-probe both addresses. Resolves to whether one answered. */
    retry: () => Promise<boolean>;
}

/**
 * Online, offline, stale — for the sync indicators (Component Inventory §7.14).
 * The indicator UI is not here: this is the state it renders.
 *
 *     const { status, isStale, retry } = useConnection();
 *
 * `isStale` is not an error. It means the last successful exchange is old
 * enough that what is on screen may have moved — the case §14 cares about,
 * where the app shows yesterday's cache during a power cut and must say so
 * rather than pass it off as live.
 */
export function useConnection(): Connection {
    const state = useSyncExternalStore(subscribeToConnection, getConnectionState);
    const retry = useCallback(() => reprobe(), []);

    return {
        ...state,
        isOnline: state.status === 'online',
        isOffline: state.status === 'offline',
        retry,
    };
}
