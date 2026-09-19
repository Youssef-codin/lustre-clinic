/**
 * SPEC §16 — "two destinations: local disk, off-site object storage". The local
 * half is the filesystem; this is the off-site half, behind one interface so
 * the run itself does not care which it is talking to.
 *
 * Google Drive is what the clinic actually uses. OAuth works with the doctor's
 * personal Gmail or Workspace account; the old service-account mode remains a
 * compatibility fallback for Workspace shared drives and domain delegation.
 *
 * Anything in an off-site store whose name does not parse as a dump is somebody
 * else's file and is dropped before retention sees it — pruning must never
 * delete a file it cannot name. Half-configured Drive is warned loudly: the run
 * still succeeds locally and still writes its marker, so the 48h staleness
 * check stays quiet while nothing is leaving the machine (§16, §17).
 */
import { config } from '../config.ts';
import { logger } from '../logger.ts';
import { createDriveClient, type DriveCredentials, normalizePrivateKey } from './drive.ts';
import { type BackupFile, parseBackupFileName } from './retention.ts';

export interface OffsiteFile extends BackupFile {
    readonly handle: string;
}

export interface OffsiteDestination {
    readonly kind: 'drive' | 's3';
    upload(name: string, body: Uint8Array): Promise<string>;
    list(): Promise<OffsiteFile[]>;
    remove(handle: string): Promise<void>;
}

function toBackupName(name: string): string {
    return name.replace(/\.enc$/, '');
}

export function selectOffsiteDumps(entries: readonly { name: string; handle: string }[]): OffsiteFile[] {
    return entries.flatMap((entry) => {
        const at = parseBackupFileName(toBackupName(entry.name));
        return at ? [{ name: entry.name, at, handle: entry.handle }] : [];
    });
}

type DriveEnvironment = Pick<
    typeof config,
    | 'BACKUP_DRIVE_FOLDER_ID'
    | 'BACKUP_DRIVE_OAUTH_CLIENT_ID'
    | 'BACKUP_DRIVE_OAUTH_CLIENT_SECRET'
    | 'BACKUP_DRIVE_REFRESH_TOKEN'
    | 'BACKUP_DRIVE_CLIENT_EMAIL'
    | 'BACKUP_DRIVE_PRIVATE_KEY'
    | 'BACKUP_DRIVE_SUBJECT'
>;

export function resolveDriveCredentials(env: DriveEnvironment): {
    credentials: DriveCredentials | null;
    missing: string[];
} {
    const oauth = {
        BACKUP_DRIVE_FOLDER_ID: env.BACKUP_DRIVE_FOLDER_ID,
        BACKUP_DRIVE_OAUTH_CLIENT_ID: env.BACKUP_DRIVE_OAUTH_CLIENT_ID,
        BACKUP_DRIVE_OAUTH_CLIENT_SECRET: env.BACKUP_DRIVE_OAUTH_CLIENT_SECRET,
        BACKUP_DRIVE_REFRESH_TOKEN: env.BACKUP_DRIVE_REFRESH_TOKEN,
    };
    const oauthConfigured = Boolean(
        env.BACKUP_DRIVE_OAUTH_CLIENT_ID ||
            env.BACKUP_DRIVE_OAUTH_CLIENT_SECRET ||
            env.BACKUP_DRIVE_REFRESH_TOKEN,
    );
    const oauthMissing = Object.entries(oauth)
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (oauthConfigured && oauthMissing.length === 0) {
        return {
            credentials: {
                kind: 'oauth',
                clientId: env.BACKUP_DRIVE_OAUTH_CLIENT_ID as string,
                clientSecret: env.BACKUP_DRIVE_OAUTH_CLIENT_SECRET as string,
                refreshToken: env.BACKUP_DRIVE_REFRESH_TOKEN as string,
                folderId: env.BACKUP_DRIVE_FOLDER_ID as string,
            },
            missing: [],
        };
    }

    const serviceAccount = {
        BACKUP_DRIVE_FOLDER_ID: env.BACKUP_DRIVE_FOLDER_ID,
        BACKUP_DRIVE_CLIENT_EMAIL: env.BACKUP_DRIVE_CLIENT_EMAIL,
        BACKUP_DRIVE_PRIVATE_KEY: env.BACKUP_DRIVE_PRIVATE_KEY,
    };
    const serviceAccountConfigured = Object.values(serviceAccount).some(Boolean);
    const serviceAccountMissing = Object.entries(serviceAccount)
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (!oauthConfigured && serviceAccountConfigured && serviceAccountMissing.length === 0) {
        return {
            credentials: {
                kind: 'service-account',
                clientEmail: env.BACKUP_DRIVE_CLIENT_EMAIL as string,
                privateKey: normalizePrivateKey(env.BACKUP_DRIVE_PRIVATE_KEY as string),
                folderId: env.BACKUP_DRIVE_FOLDER_ID as string,
                subject: env.BACKUP_DRIVE_SUBJECT,
            },
            missing: [],
        };
    }

    if (oauthConfigured) return { credentials: null, missing: oauthMissing };
    if (serviceAccountConfigured) return { credentials: null, missing: serviceAccountMissing };
    return { credentials: null, missing: [] };
}

function driveDestination(): OffsiteDestination | null {
    const resolved = resolveDriveCredentials(config);
    if (!resolved.credentials) {
        if (resolved.missing.length > 0) {
            logger.warn(
                { missing: resolved.missing },
                'Google Drive backups are partially configured — the off-site copy is disabled',
            );
        }
        return null;
    }

    const client = createDriveClient({ credentials: resolved.credentials });

    return {
        kind: 'drive',
        upload: (name, body) => client.upload(name, body),
        async list() {
            const files = await client.list();
            return selectOffsiteDumps(files.map((file) => ({ name: file.name, handle: file.id })));
        },
        remove: (handle) => client.remove(handle),
    };
}

function s3Destination(): OffsiteDestination | null {
    if (!config.BACKUP_S3_BUCKET) return null;

    const client = new Bun.S3Client({
        bucket: config.BACKUP_S3_BUCKET,
        endpoint: config.BACKUP_S3_ENDPOINT,
        region: config.BACKUP_S3_REGION,
        accessKeyId: config.BACKUP_S3_ACCESS_KEY_ID,
        secretAccessKey: config.BACKUP_S3_SECRET_ACCESS_KEY,
    });

    const prefix = `${config.BACKUP_S3_PREFIX}/`;

    return {
        kind: 's3',
        async upload(name, body) {
            const key = `${prefix}${name}`;
            await client.file(key).write(body);
            return key;
        },
        async list() {
            const listed = await client.list({ prefix });

            return selectOffsiteDumps(
                (listed.contents ?? []).map((entry) => ({
                    name: entry.key.slice(prefix.length),
                    handle: entry.key,
                })),
            );
        },
        remove: (handle) => client.delete(handle),
    };
}

export function offsiteDestination(): OffsiteDestination | null {
    return driveDestination() ?? s3Destination();
}
