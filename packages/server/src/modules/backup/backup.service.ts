/**
 * SPEC §16 read back for the app, and the one write it allows.
 *
 * The backup job's own state lives in two files beside the dumps — a success
 * marker and, when the Drive grant is gone, the note `runBackup` leaves — so
 * this reads files, like `release`, and never the database. `status` never
 * throws: a missing marker is a clinic that has not backed up yet, which is
 * what every fresh install looks like.
 *
 * `linkDrive` is the exception, and the only unauthenticated write in the
 * codebase that sets where patient data goes. That exposure is accepted
 * deliberately (§1, DECISIONS.md) on the grounds that a tailnet peer already
 * reads every record — but the phone confirms before calling it, and the code
 * it sends is single-use and worthless without the verifier that made it.
 */
import { ERROR_CODE, WS_EVENT } from '@lustre/shared';
import {
    createDriveFolder,
    DRIVE_SCOPE,
    type DriveSignInConfig,
    exchangeOAuthCode,
} from '../../backup/drive.ts';
import { type DriveGrant, readDriveGrant, writeDriveGrant } from '../../backup/grant.ts';
import { readLastSuccess, readOffsiteState, resolveDriveCredentials } from '../../backup/index.ts';
import { config } from '../../config.ts';
import { AppError } from '../../errors/AppError.ts';
import { logger } from '../../logger.ts';
import { broadcast } from '../../ws/index.ts';

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
        /** The account the phone last linked, so Settings can name it. */
        account: string | null;
        /** Whether the phone can run the sign-in at all. */
        canSignIn: boolean;
    };
}

const FOLDER_NAME = 'Lustre Clinic Backups';

async function offsiteConfigured(): Promise<boolean> {
    if (await readDriveGrant()) return true;
    if (resolveDriveCredentials(config).credentials) return true;
    return Boolean(config.BACKUP_S3_BUCKET);
}

export const backupService = {
    async status(now = Date.now()): Promise<BackupStatus> {
        const [last, offsiteState, grant, configured] = await Promise.all([
            readLastSuccess(),
            readOffsiteState(),
            readDriveGrant(),
            offsiteConfigured(),
        ]);
        const staleAfterMs = config.BACKUP_STALE_AFTER_HOURS * 3_600_000;
        const lastAt = last ? new Date(last.at).getTime() : Number.NaN;

        return {
            lastSuccessAt: last?.at ?? null,
            stale: Number.isNaN(lastAt) || now - lastAt > staleAfterMs,
            staleAfterHours: config.BACKUP_STALE_AFTER_HOURS,
            offsite: {
                configured,
                reauthorizationRequiredSince: offsiteState?.reauthorizationRequiredSince ?? null,
                account: grant?.account ?? null,
                canSignIn: Boolean(config.BACKUP_DRIVE_ANDROID_CLIENT_ID),
            },
        };
    },

    /** What the phone needs to build the consent URL. No secret exists to leak. */
    signInConfig(): DriveSignInConfig {
        if (!config.BACKUP_DRIVE_ANDROID_CLIENT_ID) {
            throw new AppError(
                ERROR_CODE.DRIVE_SIGN_IN_UNCONFIGURED,
                'BACKUP_DRIVE_ANDROID_CLIENT_ID is not set on the server',
                409,
            );
        }
        return {
            clientId: config.BACKUP_DRIVE_ANDROID_CLIENT_ID,
            redirectUri: config.BACKUP_DRIVE_ANDROID_REDIRECT_URI,
            scope: DRIVE_SCOPE,
        };
    },

    async linkDrive(input: { code: string; codeVerifier: string; account?: string }): Promise<{
        folderId: string;
        account: string | null;
    }> {
        const { clientId, redirectUri } = backupService.signInConfig();

        try {
            const tokens = await exchangeOAuthCode({
                clientId,
                code: input.code,
                codeVerifier: input.codeVerifier,
                redirectUri,
            });

            // Reuse the folder the clinic already backs up to when there is one,
            // so re-linking does not scatter dumps across two folders.
            const existing = await readDriveGrant();
            const folderId = existing?.folderId ?? (await createDriveFolder(tokens.accessToken, FOLDER_NAME));

            const grant: DriveGrant = {
                clientId,
                refreshToken: tokens.refreshToken,
                folderId,
                account: input.account,
                linkedAt: new Date().toISOString(),
            };
            await writeDriveGrant(grant);
            broadcast(WS_EVENT.SETTINGS_UPDATED);

            // No token, no account, no folder id: this line is the audit trail and
            // §4 keeps identifiers out of it.
            logger.info('drive grant linked from the app');
            return { folderId, account: input.account ?? null };
        } catch (err) {
            logger.error({ err }, 'drive link failed');
            throw new AppError(ERROR_CODE.DRIVE_LINK_FAILED, 'Google refused the sign-in', 502, {
                cause: err,
            });
        }
    },
};
