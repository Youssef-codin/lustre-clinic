import { ERROR_CODE, type ErrorCode, isErrorCode, TRPC_ENDPOINT } from '@mawid/shared';

/**
 * `_LocalTrpcClient` — BLOCKED.md. The real client, typed from `AppRouter` and
 * bound to TanStack Query, is Phase 1 F2 and has not landed. This speaks the
 * same wire format over `fetch` so the day view can be built and swapped later.
 *
 * The format is small enough to be worth not taking a dependency for, since
 * adding one to `packages/app/package.json` conflicts in four branches at once:
 *
 *   query     GET  /trpc/<path>?input=<json>
 *   mutation  POST /trpc/<path>          body: <json>
 *   success   { "result": { "data": … } }
 *   failure   { "error": { "message", "data": { "appCode", … } } }
 *
 * There is no transformer on the server, so what comes back is plain JSON.
 */

/**
 * Every failure the UI can be handed, carrying the code it localizes from.
 * §4: the client switches on `ERROR_CODE` and never parses `message`.
 */
export class RequestError extends Error {
    readonly code: ErrorCode;
    /** True when the request never reached the clinic — a power cut, wifi, Tailscale. */
    readonly offline: boolean;

    constructor(code: ErrorCode, message: string, options?: { offline?: boolean; cause?: unknown }) {
        super(message, { cause: options?.cause });
        this.name = 'RequestError';
        this.code = code;
        this.offline = options?.offline ?? false;
    }
}

export function asRequestError(err: unknown): RequestError {
    if (err instanceof RequestError) return err;
    return new RequestError(ERROR_CODE.INTERNAL, err instanceof Error ? err.message : 'request failed', {
        cause: err,
    });
}

export interface Transport {
    query(path: string, input?: unknown): Promise<unknown>;
    /**
     * The same procedure over many inputs, in one request. Batching is enabled
     * on the server (§4), and the calendar wants a month of days: thirty-one
     * round trips over Tailscale is a visibly slow sheet, one is not.
     */
    queryMany(path: string, inputs: readonly unknown[]): Promise<unknown[]>;
    mutate(path: string, input?: unknown): Promise<unknown>;
}

/** Pulls `appCode` out of a tRPC error envelope, whatever else is in it. */
function appCodeOf(body: unknown): ErrorCode {
    if (typeof body !== 'object' || body === null || !('error' in body)) return ERROR_CODE.INTERNAL;
    const error: unknown = (body as { error: unknown }).error;
    if (typeof error !== 'object' || error === null || !('data' in error)) return ERROR_CODE.INTERNAL;
    const data: unknown = (error as { data: unknown }).data;
    if (typeof data !== 'object' || data === null || !('appCode' in data)) return ERROR_CODE.INTERNAL;
    const code: unknown = (data as { appCode: unknown }).appCode;
    return isErrorCode(code) ? code : ERROR_CODE.INTERNAL;
}

function messageOf(body: unknown): string {
    if (typeof body === 'object' && body !== null && 'error' in body) {
        const error: unknown = (body as { error: unknown }).error;
        if (typeof error === 'object' && error !== null && 'message' in error) {
            const message: unknown = (error as { message: unknown }).message;
            if (typeof message === 'string') return message;
        }
    }
    return 'request failed';
}

function isEnvelope(body: unknown): boolean {
    if (Array.isArray(body)) return body.every(isEnvelope);
    return typeof body === 'object' && body !== null && ('result' in body || 'error' in body);
}

/**
 * One envelope to its data. A batch answers 200 with per-call envelopes, so the
 * error check belongs here rather than on the HTTP status alone.
 */
function unwrap(body: unknown): unknown {
    if (typeof body === 'object' && body !== null) {
        if ('error' in body) throw new RequestError(appCodeOf(body), messageOf(body));
        if ('result' in body) {
            const result: unknown = (body as { result: unknown }).result;
            if (typeof result === 'object' && result !== null && 'data' in result) {
                return (result as { data: unknown }).data;
            }
        }
    }
    // A 200 that is not an envelope means something is answering `/trpc` that is
    // not the clinic server — a captive portal, usually.
    throw new RequestError(ERROR_CODE.INTERNAL, 'unrecognized response from the server');
}

/**
 * Writes cross Tailscale to a PC in a clinic that loses power. A request that
 * hangs is indistinguishable from one that failed, and the secretary is holding
 * a patient — so every call has a deadline and a deadline is an error, not a
 * spinner that never ends.
 */
const TIMEOUT_MS = 10_000;

export function httpTransport(baseUrl: string, timeoutMs = TIMEOUT_MS): Transport {
    const root = `${baseUrl.replace(/\/$/, '')}${TRPC_ENDPOINT}`;

    async function send(path: string, init: RequestInit, search = ''): Promise<unknown> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(`${root}/${path}${search}`, { ...init, signal: controller.signal });
        } catch (cause) {
            throw new RequestError(ERROR_CODE.DB_UNAVAILABLE, 'the clinic server did not answer', {
                offline: true,
                cause,
            });
        } finally {
            clearTimeout(timer);
        }

        const body: unknown = await response.json().catch(() => null);
        // A non-2xx that is not an envelope is the transport failing, not a
        // procedure: a 404 from a proxy, a 502 from nothing listening.
        if (!response.ok && !isEnvelope(body)) {
            throw new RequestError(
                ERROR_CODE.DB_UNAVAILABLE,
                `the clinic server answered ${response.status}`,
                {
                    offline: true,
                },
            );
        }
        return body;
    }

    return {
        async query(path, input) {
            const search = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
            return unwrap(await send(path, { method: 'GET' }, search));
        },
        async queryMany(path, inputs) {
            if (inputs.length === 0) return [];

            const indexed = Object.fromEntries(inputs.map((input, index) => [index, input]));
            const search = `?batch=1&input=${encodeURIComponent(JSON.stringify(indexed))}`;
            const body = await send(Array(inputs.length).fill(path).join(','), { method: 'GET' }, search);

            if (!Array.isArray(body)) {
                throw new RequestError(ERROR_CODE.INTERNAL, 'unrecognized batch response from the server');
            }
            // One failure fails the call. A month with a hole in it would draw a
            // quiet day where the query simply did not answer.
            return body.map((envelope: unknown) => unwrap(envelope));
        },
        async mutate(path, input) {
            return unwrap(
                await send(path, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(input ?? {}),
                }),
            );
        },
    };
}

/**
 * The clinic's address. Onboarding (§14 — LAN first, then the MagicDNS name)
 * is F1 and has not landed, so for now it is a build-time value and its absence
 * means the fixture transport. `EXPO_PUBLIC_` is what Expo inlines.
 */
export const SERVER_URL: string | undefined = process.env.EXPO_PUBLIC_MAWID_API;
