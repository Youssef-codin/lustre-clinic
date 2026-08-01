import type { Server } from 'node:http';
import type { ServerEvent, ServerEventName, ServerEvents } from '@mawid/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../middleware/logger.ts';

let wss: WebSocketServer | null = null;

/** Attached to the same HTTP server and port — the clinic opens one port, not two. */
export function attachWebSocket(server: Server): WebSocketServer {
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (socket) => {
        logger.debug({ clients: wss?.clients.size }, 'ws client connected');
        socket.on('close', () => logger.debug({ clients: wss?.clients.size }, 'ws client disconnected'));
        socket.on('error', (err) => logger.warn({ err }, 'ws client error'));
    });

    return wss;
}

/** Typed fan-out to every desk screen and phone currently connected. */
export function broadcast<E extends ServerEventName>(event: E, payload: ServerEvents[E]): void {
    if (!wss) return;

    const message: ServerEvent<E> = { event, at: new Date().toISOString(), payload };
    const frame = JSON.stringify(message);

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(frame);
    }
}

export function closeWebSocket(): Promise<void> {
    return new Promise((resolve) => {
        if (!wss) return resolve();
        wss.close(() => resolve());
        wss = null;
    });
}
