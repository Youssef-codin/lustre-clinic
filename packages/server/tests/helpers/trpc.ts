import { expect } from 'bun:test';
import { type ErrorCode, TRPC_ENDPOINT, WS_PATH } from '@mawid/shared';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { Server } from 'bun';
import { createServer } from '../../src/server.ts';
import type { AppRouter } from '../../src/trpc/router.ts';
import type { WsData } from '../../src/ws/index.ts';

/**
 * A real `Bun.serve` on an ephemeral port with a real tRPC client pointed at it.
 *
 * The service-level suites prove the business rules; this proves the wiring —
 * that a request survives the Zod schemas, reaches the service, and comes back
 * as the status and `appCode` the client switches on (§4). None of that is
 * exercised by importing a service directly.
 */

export type TestClient = ReturnType<typeof createTRPCClient<AppRouter>>;

export interface TestServer {
    client: TestClient;
    baseUrl: string;
    /** For raw `fetch` assertions — status codes, batching, unknown paths. */
    endpoint: string;
    wsUrl: string;
    /** Requests the adapter has served, for asserting on batching. */
    requestCount(): number;
    resetRequestCount(): void;
    stop(): void;
}

export function startTestServer(): TestServer {
    // Port 0 lets the OS pick a free one, so tests never collide with `bun dev`.
    const server: Server<WsData> = createServer(0);
    const baseUrl = `http://localhost:${server.port}`;

    let requests = 0;
    // Typed as the link expects rather than as the global `fetch`, whose Bun
    // signature carries extras (`preconnect`) a plain function cannot satisfy.
    const countingFetch = (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        requests += 1;
        return fetch(input, init);
    };

    const client = createTRPCClient<AppRouter>({
        links: [httpBatchLink({ url: `${baseUrl}${TRPC_ENDPOINT}`, fetch: countingFetch })],
    });

    return {
        client,
        baseUrl,
        endpoint: `${baseUrl}${TRPC_ENDPOINT}`,
        wsUrl: `ws://localhost:${server.port}${WS_PATH}`,
        requestCount: () => requests,
        resetRequestCount: () => {
            requests = 0;
        },
        stop: () => server.stop(true),
    };
}

interface TrpcErrorData {
    appCode?: string;
    httpStatus?: number;
    code?: string;
}

function dataOf(err: unknown): TrpcErrorData {
    if (!(err instanceof TRPCClientError)) {
        throw new Error(`expected a TRPCClientError, got ${err instanceof Error ? err.message : typeof err}`);
    }
    return (err.data ?? {}) as TrpcErrorData;
}

/**
 * Asserts a call fails with a specific `appCode` **and** HTTP status.
 *
 * Both halves matter and neither is asserted anywhere today: the client
 * localizes from `appCode` and never parses the message (§4), while the status
 * is what `trpcCodeFor` derives from `AppError.httpStatus`. A code that arrives
 * with the wrong status is a bug the client sees as a different failure.
 */
export async function expectTrpcError(
    code: ErrorCode,
    httpStatus: number,
    fn: () => Promise<unknown>,
): Promise<void> {
    try {
        await fn();
    } catch (err) {
        const data = dataOf(err);
        expect(data.appCode).toBe(code);
        expect(data.httpStatus).toBe(httpStatus);
        return;
    }
    throw new Error(`expected ${code} (HTTP ${httpStatus}), but the call resolved`);
}

/** A malformed input never reaches a service: Zod rejects it as 400/VALIDATION. */
export async function expectValidationError(fn: () => Promise<unknown>): Promise<void> {
    await expectTrpcError('VALIDATION' as ErrorCode, 400, fn);
}

/**
 * Collects websocket messages pushed while `fn` runs (§13 — the server tells the
 * clients what changed and they refetch).
 */
export async function captureWsEvents<T>(
    wsUrl: string,
    fn: () => Promise<T>,
): Promise<{ result: T; events: Record<string, string>[] }> {
    const ws = new WebSocket(wsUrl);
    const events: Record<string, string>[] = [];

    await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('websocket failed to open'));
    });

    ws.onmessage = (event) => {
        events.push(JSON.parse(String(event.data)) as Record<string, string>);
    };

    try {
        const result = await fn();
        // Broadcasts are fire-and-forget, so give the socket a turn to deliver.
        await Bun.sleep(50);
        return { result, events };
    } finally {
        ws.close();
    }
}
