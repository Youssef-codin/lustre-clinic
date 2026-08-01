import { randomUUID } from 'node:crypto';
import type { PrintFailure } from '@mawid/shared';
import { logger } from '../../middleware/logger.ts';
import { broadcast } from '../../ws/index.ts';
import { setStatus } from '../status.ts';
import type { PrintDriver, PrintJob } from './driver.ts';

/**
 * A silent failure to print is worse than no printing, so this queue is loud
 * and not durable — spec §7. Jobs live in memory, retry a bounded number of
 * times, and on final failure surface on the websocket and in a small ring
 * buffer the desk banner reads. Anything lost to a restart is recovered with a
 * reprint, because every printable thing can be rendered again.
 */

const FAILURE_HISTORY = 10;

export interface QueueOptions {
    /** Attempts per job, including the first. */
    maxAttempts?: number;
    /** Backoff before each retry. One entry per retry, last value reused. */
    retryDelaysMs?: number[];
}

const defaults = { maxAttempts: 3, retryDelaysMs: [1_000, 4_000] };
let options = defaults;

const failures: PrintFailure[] = [];
const queue: { job: PrintJob; attempts: number }[] = [];
let draining: Promise<void> | null = null;
let driver: PrintDriver | null = null;

export function setDriver(next: PrintDriver, overrides: QueueOptions = {}): void {
    driver = next;
    options = { ...defaults, ...overrides };
}

/** Most recent first. Read by the desk banner via the print module. */
export function recentFailures(): readonly PrintFailure[] {
    return failures;
}

export function clearFailures(): void {
    failures.length = 0;
}

/**
 * One failure record, pushed live and kept for the banner. Both paths carry the
 * identical object — a desk screen that reloads mid-failure must not see a
 * different shape from one that was connected, and the `id` lets it dedupe the
 * live event against the fetched list.
 */
function recordFailure(job: PrintJob, error: unknown, attempts: number): void {
    const message = error instanceof Error ? error.message : String(error);

    const failure: PrintFailure = {
        ...job.target,
        id: randomUUID(),
        error: message,
        driver: driver?.name ?? 'none',
        attempts,
        failedAt: new Date().toISOString(),
    };

    failures.unshift(failure);
    failures.length = Math.min(failures.length, FAILURE_HISTORY);

    setStatus('printer', 'degraded');
    logger.error({ job: job.id, kind: job.target.kind, attempts, err: message }, 'print failed');
    broadcast('print:failed', failure);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function drainLoop(): Promise<void> {
    while (queue.length > 0) {
        const entry = queue[0];
        if (!entry || !driver) break;

        try {
            await driver.print(entry.job);
            queue.shift();
            setStatus('printer', 'ok');
        } catch (err) {
            entry.attempts += 1;

            if (entry.attempts >= options.maxAttempts) {
                queue.shift();
                recordFailure(entry.job, err, entry.attempts);
                continue;
            }

            // Printer off, out of paper, spooler busy — all worth another go.
            logger.warn({ job: entry.job.id, attempt: entry.attempts }, 'print attempt failed, retrying');
            await wait(options.retryDelaysMs[entry.attempts - 1] ?? options.retryDelaysMs.at(-1) ?? 0);
        }
    }
}

/** One drain at a time; a job enqueued mid-drain is picked up by the running loop. */
function startDraining(): void {
    if (draining) return;
    draining = drainLoop().finally(() => {
        draining = null;
    });
}

/**
 * Fire-and-forget: the secretary books, the response returns, and paper comes
 * out on its own. A print must never make a booking slower or fail it.
 */
export function enqueue(job: PrintJob): void {
    if (!driver) {
        logger.warn({ job: job.id }, 'print enqueued before the printer service started');
        return;
    }

    queue.push({ job, attempts: 0 });
    startDraining();
}

/**
 * Resolves once the queue is empty. Awaits the in-flight drain rather than
 * starting a second one — the loop is single-threaded by design, so a caller
 * that just enqueued must wait for the drain already running, not race it.
 */
export async function flush(): Promise<void> {
    startDraining();
    while (draining) await draining;
}
