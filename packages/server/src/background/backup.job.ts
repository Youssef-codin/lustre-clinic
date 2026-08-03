import { readLastSuccess, runBackup } from '../backup/index.ts';
import { config } from '../config.ts';
import { logger } from '../logger.ts';
import { alert } from '../monitoring/index.ts';

/**
 * SPEC §16 — `pg_dump` on a schedule inside the compose stack, and an alert
 * when no backup has succeeded in 48h.
 *
 * The schedule is an interval rather than a cron expression: the clinic machine
 * is powered off overnight (§15), so a fixed wall-clock time would be missed
 * routinely. An interval from boot always runs.
 */

export interface BackupJob {
    /** Runs one backup now, outside the schedule. Never throws. */
    runNow(): Promise<void>;
    stop(): void;
}

export function startBackupJob(): BackupJob {
    const intervalMs = config.BACKUP_INTERVAL_HOURS * 3_600_000;
    const staleAfterMs = config.BACKUP_STALE_AFTER_HOURS * 3_600_000;

    async function runNow(): Promise<void> {
        try {
            await runBackup();
        } catch {
            // `runBackup` has already logged and alerted. The job survives so
            // the next interval still tries.
        }
    }

    /** §16: alert on no successful backup in 48h, not only on a failed run. */
    async function checkStaleness(): Promise<void> {
        const last = await readLastSuccess();
        const ageMs = last ? Date.now() - new Date(last.at).getTime() : Number.POSITIVE_INFINITY;

        if (ageMs > staleAfterMs) {
            await alert({
                code: 'backup.stale',
                summary: 'No backup has succeeded recently.',
                context: {
                    lastSuccessAt: last?.at ?? null,
                    thresholdHours: config.BACKUP_STALE_AFTER_HOURS,
                },
            });
        }
    }

    void checkStaleness();

    const timer = setInterval(() => {
        void runNow().then(checkStaleness);
    }, intervalMs);
    timer.unref?.();

    logger.info({ intervalHours: config.BACKUP_INTERVAL_HOURS }, 'backup job started');

    return {
        runNow,
        stop() {
            clearInterval(timer);
        },
    };
}
