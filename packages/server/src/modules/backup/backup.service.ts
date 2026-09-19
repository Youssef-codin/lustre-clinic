/**
 * SPEC §16 read back for the app. The backup job's own state lives in two files
 * beside the dumps — a success marker and, when the Drive grant is gone, the
 * note `runBackup` leaves — so this reads files, like `release`, and never the
 * database.
 *
 * Nothing here throws. A missing marker is a clinic that has not backed up yet,
 * which is what every fresh install looks like, and Settings draws that as
 * plainly as it draws a stale one.
 */
import { readLastSuccess, readOffsiteState, resolveDriveCredentials } from '../../backup/index.ts';
import { config } from '../../config.ts';

interface BackupStatus {
    lastSuccessAt: string | null;
    /** No successful run inside `BACKUP_STALE_AFTER_HOURS` — the §17 alert's threshold. */
    stale: boolean;
    staleAfterHours: number;
    offsite: {
        /** Drive or S3 is fully configured. False means local dumps only. */
        configured: boolean;
        /** When set, the doctor's Google grant is gone and only a person can fix it. */
        reauthorizationRequiredSince: string | null;
    };
}

function offsiteConfigured(): boolean {
    if (resolveDriveCredentials(config).credentials) return true;
    return Boolean(config.BACKUP_S3_BUCKET);
}

export const backupService = {
    async status(now = Date.now()): Promise<BackupStatus> {
        const [last, offsiteState] = await Promise.all([readLastSuccess(), readOffsiteState()]);
        const staleAfterMs = config.BACKUP_STALE_AFTER_HOURS * 3_600_000;
        const lastAt = last ? new Date(last.at).getTime() : Number.NaN;

        return {
            lastSuccessAt: last?.at ?? null,
            stale: Number.isNaN(lastAt) || now - lastAt > staleAfterMs,
            staleAfterHours: config.BACKUP_STALE_AFTER_HOURS,
            offsite: {
                configured: offsiteConfigured(),
                reauthorizationRequiredSince: offsiteState?.reauthorizationRequiredSince ?? null,
            },
        };
    },
};
