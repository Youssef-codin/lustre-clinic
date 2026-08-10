import { QueryClient } from '@tanstack/react-query';
import { classifyError } from './errors';

// Defaults tuned for one clinic, two phones and a server that is sometimes off.
// Fail fast: a read is tried at most twice, a write never retried — §14 forbids
// queuing writes, and a silent retry of `appointment.create` after a timeout is
// how you book a patient twice. A two-minute `staleTime` (matched by `/ws`
// invalidation) and a one-day `gcTime` keep a launch during a power cut
// renderable read-only. `networkMode: 'always'` because the clinic server is on
// the LAN or tailnet, where "no internet" says nothing about reachability, and
// a paused query would hang forever instead of failing.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 120_000,
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
