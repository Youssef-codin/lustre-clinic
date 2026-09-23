/**
 * SPEC §13. Native Bun WebSockets, upgraded in the same `fetch` handler and
 * kept separate from tRPC — with two clients and low volume, tRPC subscriptions
 * are not required.
 *
 * Payloads carry IDs only. The client refetches through tRPC on receipt, so no
 * patient data crosses this channel. The channel is server-to-client only;
 * client messages are ignored. Like every other route it is reachable only on
 * the tailnet, which is the whole authorization model (§1) — there is no user
 * to authenticate a socket as.
 *
 * Delivery is at most once per socket, and recovery is the client's to ask for:
 * it reconnects with the `epoch` and last `seq` it applied, and gets the frames
 * it missed replayed from `recent`, or `resync` when they are gone — the process
 * restarted, or more happened than `REPLAY_LIMIT` holds. Either way the client
 * converges on the server's state, and never by trusting a frame's content:
 * every event only says what to refetch.
 */
import { WS_PROTOCOL_VERSION, WS_RESUME_PARAM, type WsEvent, type WsFrame } from '@lustre/shared';
import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { logger } from '../logger.ts';

export interface Resume {
    epoch: string;
    since: number;
}

export interface WsData {
    connectedAt: number;
    resume: Resume | null;
}

type Socket = ServerWebSocket<WsData>;
type EventFrame = Extract<WsFrame, { type: 'event' }>;

/** A dropped Tailscale link for a few minutes of a clinic morning is tens of events. */
const REPLAY_LIMIT = 256;

const epoch = Bun.randomUUIDv7();
let seq = 0;
const recent: EventFrame[] = [];

const sockets = new Set<Socket>();

export function resumeFrom(url: URL): Resume | null {
    const from = url.searchParams.get(WS_RESUME_PARAM.EPOCH);
    const since = Number(url.searchParams.get(WS_RESUME_PARAM.SINCE));
    if (!from || !Number.isSafeInteger(since) || since < 0) return null;
    return { epoch: from, since };
}

/** Null when the gap cannot be filled and the client has to refetch everything. */
function replayFor(resume: Resume | null): EventFrame[] | null {
    if (!resume || resume.epoch !== epoch || resume.since > seq) return null;
    const oldest = recent[0]?.seq ?? seq + 1;
    if (resume.since + 1 < oldest) return null;
    return recent.filter((frame) => frame.seq > resume.since);
}

export const wsHandlers: WebSocketHandler<WsData> = {
    open(ws) {
        // Synchronous from here to `add`, so no broadcast can land between the
        // replay and the socket joining the live stream.
        const replay = replayFor(ws.data.resume);
        for (const frame of replay ?? []) ws.send(JSON.stringify(frame));
        const hello: WsFrame = { v: WS_PROTOCOL_VERSION, type: 'hello', epoch, seq, resync: replay === null };
        ws.send(JSON.stringify(hello));
        sockets.add(ws);
        logger.info(
            { clients: sockets.size, replayed: replay?.length ?? 0, resync: replay === null, seq },
            'ws client connected',
        );
    },
    close(ws) {
        sockets.delete(ws);
        logger.info({ clients: sockets.size }, 'ws client disconnected');
    },
    message() {},
};

export function broadcast(event: WsEvent, payload: { id?: string } = {}): void {
    seq += 1;
    const frame: EventFrame = {
        v: WS_PROTOCOL_VERSION,
        type: 'event',
        epoch,
        seq,
        at: Date.now(),
        event,
        ...payload,
    };
    recent.push(frame);
    if (recent.length > REPLAY_LIMIT) recent.shift();

    const message = JSON.stringify(frame);
    let dropped = 0;
    for (const ws of sockets) {
        // 0 is a send Bun dropped outright; the client finds out from the gap.
        if (ws.send(message) === 0) dropped += 1;
    }
    logger.debug({ event, seq, clients: sockets.size, dropped }, 'ws event');
}
