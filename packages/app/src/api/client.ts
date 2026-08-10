import type { AppRouter } from '@mawid/server/src/trpc/router.ts';
import { TRPC_ENDPOINT } from '@mawid/shared';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { timing } from './config';
import { markOffline, markOnline, resolveBaseUrl } from './connection';
import { queryClient } from './queryClient';

/**
 * The tRPC client, typed off the server's `AppRouter` (SPEC §3). No request or
 * response type is written anywhere in this package — they are all inferred
 * from that one import, which is a type-only import and disappears at build.
 *
 * Batching is on, matching the server adapter (§4).
 */

/**
 * The link needs a URL at construction time and the real one is not known until
 * a probe has run, so it is given an unroutable placeholder and the fetch below
 * rewrites the origin per request. That is also the hook that keeps the
 * connection state honest: every call reports whether the server answered.
 */
const PLACEHOLDER_ORIGIN = 'http://server.invalid';

function withTimeout(init: RequestInit | undefined, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // React Query aborts on unmount; that has to reach the socket too.
    const caller = init?.signal;
    const forward = () => controller.abort();
    caller?.addEventListener('abort', forward);

    return {
        signal: controller.signal,
        done: () => {
            clearTimeout(timer);
            caller?.removeEventListener('abort', forward);
        },
    };
}

async function serverFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Throws `ServerUnreachableError` when neither address answers, which
    // `classifyError` reports as `offline`.
    const base = await resolveBaseUrl();

    const requested = new URL(input instanceof Request ? input.url : String(input));
    const target = `${base}${requested.pathname}${requested.search}`;

    const { signal, done } = withTimeout(init, timing.requestMs);

    try {
        const response =
            input instanceof Request
                ? await fetch(new Request(target, input), { signal })
                : await fetch(target, { ...init, signal });
        // A 4xx or a 5xx is still the server answering: the connection is fine
        // and the failure belongs to the procedure.
        markOnline();
        return response;
    } catch (error) {
        markOffline();
        throw error;
    } finally {
        done();
    }
}

export const trpcClient = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: `${PLACEHOLDER_ORIGIN}${TRPC_ENDPOINT}`,
            fetch: serverFetch,
        }),
    ],
});

/**
 * The same options proxy `useTRPC()` returns, outside React. Used for query
 * keys and invalidation from places that are not components — the websocket
 * listener, mostly. Screens use `useTRPC()`.
 */
export const api = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });
