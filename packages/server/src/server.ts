/**
 * SPEC §4. `Bun.serve` is the entire HTTP layer — no Express, no `ws`
 * dependency. It hosts the tRPC fetch adapter, native WebSockets, and (later)
 * APK downloads.
 *
 * There is no public ingress and no TLS: Tailscale is the transport and the
 * security boundary (§1).
 */
import { TRPC_ENDPOINT, WS_PATH } from '@mawid/shared';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Server } from 'bun';
import { config } from './config.ts';
import { logger } from './logger.ts';
import { createContext } from './trpc/init.ts';
import { appRouter } from './trpc/router.ts';
import { type WsData, wsHandlers } from './ws/index.ts';

export function createServer(port = config.PORT): Server<WsData> {
    return Bun.serve({
        port,
        fetch(req, server) {
            const url = new URL(req.url);

            if (url.pathname === WS_PATH) {
                if (server.upgrade(req, { data: { connectedAt: Date.now() } })) return;
                return new Response('Expected a websocket upgrade', { status: 426 });
            }

            if (url.pathname.startsWith(TRPC_ENDPOINT)) {
                return fetchRequestHandler({
                    endpoint: TRPC_ENDPOINT,
                    req,
                    router: appRouter,
                    createContext,
                    allowBatching: true,
                });
            }

            return new Response('Not found', { status: 404 });
        },
        websocket: wsHandlers,
        error(err) {
            logger.error({ err }, 'unhandled server error');
            return new Response('Internal error', { status: 500 });
        },
    });
}
