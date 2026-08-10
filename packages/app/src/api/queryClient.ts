import { QueryClient } from '@tanstack/react-query';
import { classifyError } from './errors';

/**
 * Defaults tuned for one clinic, two phones and a server that is sometimes off.
 *
 * **Fail fast.** An unreachable clinic PC has to surface in seconds. A request
 * is capped at `timing.requestMs`, a read is tried at most twice, and a write is
 * never retried at all — §14 forbids queuing writes, and a silent retry of
 * `appointment.create` after a timeout is how you book a patient twice.
 *
 * **Data changes rarely.** Two users, a few dozen rows a day. A two-minute
 * `staleTime` stops every screen mount from re-fetching a day view that nobody
 * has touched, and `/ws` invalidates the moment the other phone does touch it.
 *
 * **`networkMode: 'always'`.** React Query's default pauses queries when the
 * device reports no internet. The clinic server is on the LAN or the tailnet, so
 * "no internet" says nothing about whether it is reachable — and pausing would
 * leave a query pending forever instead of failing, which is the one thing §14
 * does not allow.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 120_000,
            // Keep the cache for a day so a launch during a power cut still has
            // today's schedule to render read-only (§14).
            gcTime: 24 * 60 * 60 * 1000,
            networkMode: 'always',
            retry: (failureCount, error) => failureCount < 1 && classifyError(error).retryable,
            retryDelay: 300,
            refetchOnReconnect: false,
        },
        mutations: {
            networkMode: 'always',
            retry: false,
        },
    },
});
