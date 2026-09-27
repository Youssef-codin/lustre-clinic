import { joinLinkOf } from '@lustre/shared';
// biome-ignore lint/style/noRestrictedImports: listens for the links Android opens the app with — a native event source
import { useEffect, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';

// A role code handed to the app by a link — the "Open in Lustre" button on the
// server's join page (`server/src/modules/device/device.http.ts`), which is how a
// phone that installed the app from that page gets its role without scanning
// again. The link also names the server the page came from, which a fresh
// install uses to fill in setup.
//
// Nothing is done with it here. A link can come from anywhere, so the shell
// asks before redeeming it, and setup still makes the person connect.

export interface PendingJoin {
    code: string;
    server: string | null;
}

let pending: PendingJoin | null = null;
const listeners = new Set<() => void>();

function set(next: PendingJoin | null): void {
    pending = next;
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function receive(url: string | null): void {
    const join = url ? joinLinkOf(url) : null;
    if (join) set(join);
}

/** Once, at the root: the link the app was launched by, and any it is handed while open. */
export function useJoinLinks(): void {
    useEffect(() => {
        void Linking.getInitialURL()
            .then(receive)
            .catch(() => undefined);
        const subscription = Linking.addEventListener('url', ({ url }) => receive(url));
        return () => subscription.remove();
    }, []);
}

export function usePendingJoin(): PendingJoin | null {
    return useSyncExternalStore(subscribe, () => pending);
}

export function clearPendingJoin(): void {
    set(null);
}
