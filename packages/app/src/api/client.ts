import type { AppRouter } from '@lustre/server/src/trpc/router.ts';
import { TRPC_ENDPOINT } from '@lustre/shared';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { timing } from './config';
import { markOffline, markOnline, resolveBaseUrl } from './connection';
import { queryClient } from './queryClient';

// The link needs a URL at construction time, but the real origin is only known
// after a probe has run, so it is given an unroutable placeholder and
// `serverFetch` rewrites the origin per request — the same hook keeps the
// connection state honest. A 4xx/5xx still counts as the server answering
// (markOnline); only a request that never reaches it is offline.
const PLACEHOLDER_ORIGIN = 'http://server.invalid';

function withTimeout(init: RequestInit | undefined, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
    const base = await resolveBaseUrl();

    const requested = new URL(input instanceof Request ? input.url : String(input));
    const target = `${base}${requested.pathname}${requested.search}`;

    const { signal, done } = withTimeout(init, timing.requestMs);

    try {
        const response =
            input instanceof Request
                ? await fetch(new Request(target, input), { signal })
                : await fetch(target, { ...init, signal });
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

export const api = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });
