import type { WsEvent } from '@mawid/shared';
import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { logger } from '../logger.ts';

/**
 * SPEC §13. Native Bun WebSockets, upgraded in the same `fetch` handler and
 * kept separate from tRPC — with two clients and low volume, tRPC subscriptions
 * are not required.
 *
 * Payloads carry IDs only. The client refetches through tRPC on receipt, so no
 * patient data crosses this channel.
 */

export interface WsData {
    connectedAt: number;
}

type Socket = ServerWebSocket<WsData>;

const TOPIC = 'clinic';

const sockets = new Set<Socket>();

export const wsHandlers: WebSocketHandler<WsData> = {
    open(ws) {
        sockets.add(ws);
        ws.subscribe(TOPIC);
        logger.debug({ clients: sockets.size }, 'ws client connected');
    },
    close(ws) {
        sockets.delete(ws);
        ws.unsubscribe(TOPIC);
        logger.debug({ clients: sockets.size }, 'ws client disconnected');
    },
    message() {
        // The channel is server-to-client only. Client messages are ignored.
    },
};

export function broadcast(event: WsEvent, payload: Record<string, string> = {}): void {
    const message = JSON.stringify({ event, ...payload });
    for (const ws of sockets) {
        ws.send(message);
    }
}

export function connectedClients(): number {
    return sockets.size;
}
