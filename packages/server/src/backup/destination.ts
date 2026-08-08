import { config } from '../config.ts';
import { logger } from '../logger.ts';
import { createDriveClient, normalizePrivateKey } from './drive.ts';
import { type BackupFile, parseBackupFileName } from './retention.ts';

/**
 * SPEC §16 — "two destinations: local disk, off-site object storage". The local
 * half is the filesystem; this is the off-site half, behind one interface so
 * the run itself does not care which it is talking to.
 *
 * Google Drive is what the clinic actually uses. S3 stays because the interface
 * is the same shape either way and an object store is the obvious fallback if
 * Drive's service-account storage rules (see `drive.ts`) get in the way.
 */

/** A dump off-site: the name it is stored under, and what deletes it. */
export interface OffsiteFile extends BackupFile {
    readonly handle: string;
}

export interface OffsiteDestination {
    /** For logs and alerts. */
    readonly kind: 'drive' | 's3';
    /** Returns an opaque handle — a Drive file id, or an S3 key. */
    upload(name: string, body: Uint8Array): Promise<string>;
    /** Dumps already there, so retention can be applied off-site too. */
    list(): Promise<OffsiteFile[]>;
    remove(handle: string): Promise<void>;
}

/** `mawid-….dump.enc` → the dump name retention understands. */
function toBackupName(name: string): string {
    return name.replace(/\.enc$/, '');
}

/**
 * A raw listing from an off-site store, reduced to the dumps in it.
 *
 * Anything whose name does not parse as a dump is somebody else's file and is
 * dropped here rather than handed to retention — pruning must never delete a
 * file it cannot name. Pure and exported so that property can be tested without
 * credentials.
 */
export function selectOffsiteDumps(entries: readonly { name: string; handle: string }[]): OffsiteFile[] {
    return entries.flatMap((entry) => {
        const at = parseBackupFileName(toBackupName(entry.name));
        return at ? [{ name: entry.name, at, handle: entry.handle }] : [];
    });
}

function driveDestination(): OffsiteDestination | null {
    const { BACKUP_DRIVE_FOLDER_ID, BACKUP_DRIVE_CLIENT_EMAIL, BACKUP_DRIVE_PRIVATE_KEY } = config;
    if (!BACKUP_DRIVE_FOLDER_ID || !BACKUP_DRIVE_CLIENT_EMAIL || !BACKUP_DRIVE_PRIVATE_KEY) {
        const missing = [
            BACKUP_DRIVE_FOLDER_ID ? null : 'BACKUP_DRIVE_FOLDER_ID',
            BACKUP_DRIVE_CLIENT_EMAIL ? null : 'BACKUP_DRIVE_CLIENT_EMAIL',
            BACKUP_DRIVE_PRIVATE_KEY ? null : 'BACKUP_DRIVE_PRIVATE_KEY',
        ].filter((name) => name !== null);

        // Half-configured is the dangerous case: the run still succeeds locally
        // and still writes its marker, so the 48h staleness check stays quiet
        // while nothing is leaving the machine (§16, §17). Say so loudly. All
        // three unset is just "no Drive", and stays silent.
        if (missing.length < 3) {
            logger.warn(
                { missing },
                'Google Drive backups are partially configured — the off-site copy is disabled',
            );
        }
        return null;
    }

    const client = createDriveClient({
        credentials: {
            clientEmail: BACKUP_DRIVE_CLIENT_EMAIL,
            privateKey: normalizePrivateKey(BACKUP_DRIVE_PRIVATE_KEY),
            folderId: BACKUP_DRIVE_FOLDER_ID,
            subject: config.BACKUP_DRIVE_SUBJECT,
        },
    });

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

/** Null when no off-site destination is configured; uploads are then skipped. */
export function offsiteDestination(): OffsiteDestination | null {
    return driveDestination() ?? s3Destination();
}
