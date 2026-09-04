import { getConnectionState, subscribeToConnection } from './connection';
import { queryClient } from './queryClient';

/**
 * What happens to a failed query once the clinic answers again.
 *
 * The shell's disconnected route is entered on the connection's word and left
 * the same way, so the app comes back the moment a probe succeeds. The queries
 * that failed while it was down do not: React Query holds an error until
 * something asks again, and nothing did. The screen she was on kept rendering
 * its own "could not reach the clinic" card — over a server that was, by then,
 * reachable — with its search field live above it.
 *
 * That is the same complaint the disconnected route was written for, one step
 * later: a per-screen answer to a question the connection has already answered.
 * So the repair belongs here rather than in each cluster's query-state
 * rendering, and there is nothing for a screen to do about it.
 *
 * `refetchOnReconnect` is deliberately off (`queryClient.ts`) and stays off. It
 * fires on the device regaining *internet*, which says nothing about whether
 * the clinic PC on the LAN or the tailnet is up — the whole point of §14. This
 * is that hook rewritten against the only signal that means anything here.
 *
 * Only failures are touched. A query that succeeded before the drop keeps its
 * data and its own `staleTime`; refetching the world on every reconnect would
 * put four tabs' worth of requests through a server that has just come back,
 * which is the worst moment to do it.
 */
export function startConnectionRecovery(): () => void {
    let previous = getConnectionState().status;

    return subscribeToConnection(() => {
        const { status } = getConnectionState();
        const recovered = status === 'online' && previous !== 'online';
        previous = status;

        if (!recovered) return;

        // On screen now: refetch, so the error card is replaced by data without
        // her touching anything.
        void queryClient.refetchQueries({
            type: 'active',
            predicate: (query) => query.state.status === 'error',
        });

        // Not on screen: drop the error instead of refetching it. The request
        // would be spent on a pane nobody is looking at, and clearing it is
        // enough — a reset query fetches when it next mounts.
        queryClient.resetQueries({
            type: 'inactive',
            predicate: (query) => query.state.status === 'error',
        });
    });
}
