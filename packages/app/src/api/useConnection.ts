import { useCallback, useSyncExternalStore } from 'react';
import { type ConnectionState, getConnectionState, reprobe, subscribeToConnection } from './connection';

// Online, offline, stale — the state the sync indicators render (§7.14). The
// indicator UI is not here: this is the state it renders. `isStale` is not an
// error: it means the last successful exchange is old enough that what is on
// screen may have moved — e.g. a power cut showing yesterday's cache — and the
// app must say so rather than pass the data off as live.
export interface Connection extends ConnectionState {
    isOnline: boolean;
    isOffline: boolean;
    retry: () => Promise<boolean>;
}

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
