import { expect } from 'bun:test';
import { type ErrorCode, TRPC_ENDPOINT, WS_PATH } from '@lustre/shared';
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
 * exercised by importing a service directly. `expectTrpcError` asserts the
 * `appCode` and the HTTP status together, since a code with the wrong status is
 * a bug the client sees as a different failure. Websocket broadcasts are
 * fire-and-forget, so `captureWsEvents` yields a turn before asserting.
 */

export type TestClient = ReturnType<typeof createTRPCClient<AppRouter>>;

export interface TestServer {
    client: TestClient;
    baseUrl: string;
    endpoint: string;
    wsUrl: string;
    requestCount(): number;
    resetRequestCount(): void;
    stop(): void;
}

export function startTestServer(): TestServer {
    const server: Server<WsData> = createServer(0);
    const baseUrl = `http://localhost:${server.port}`;

    let requests = 0;
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

export async function expectValidationError(fn: () => Promise<unknown>): Promise<void> {
    await expectTrpcError('VALIDATION' as ErrorCode, 400, fn);
}

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
        await Bun.sleep(50);
        return { result, events };
    } finally {
        ws.close();
    }
}
