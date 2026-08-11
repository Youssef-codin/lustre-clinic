/**
 * SPEC §17 — the external check that the machine is responding. It catches
 * power cuts, crashes, and network failure, which the app cannot report itself.
 *
 * Nothing can reach the clinic machine from outside the tailnet, so the check
 * is inverted: the server pings out on an interval and the monitor
 * (UptimeRobot heartbeat, or any equivalent) alerts on silence. A failed ping
 * is logged, never alerted — if the network is down the alert cannot leave
 * either, and silence is exactly the signal the monitor is watching for.
 *
 * The timer is `unref`'d so the heartbeat is never the reason the process stays
 * alive.
 */
import { logger } from '../logger.ts';

export interface HeartbeatOptions {
    url: string;
    intervalMs: number;
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface Heartbeat {
    ping(): Promise<boolean>;
    stop(): void;
}

export function startHeartbeat(options: HeartbeatOptions): Heartbeat {
    const { url, intervalMs, fetchImpl = fetch } = options;

    async function ping(): Promise<boolean> {
        try {
            const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
            if (!res.ok) {
                logger.warn({ status: res.status }, 'heartbeat rejected');
                return false;
            }
            logger.debug('heartbeat sent');
            return true;
        } catch (err) {
            logger.warn({ err }, 'heartbeat failed');
            return false;
        }
    }

    void ping();
    const timer = setInterval(() => void ping(), intervalMs);
    timer.unref?.();

    logger.info({ intervalSeconds: intervalMs / 1000 }, 'heartbeat started');

    return {
        ping,
        stop() {
            clearInterval(timer);
        },
    };
}
