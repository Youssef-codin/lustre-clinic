import { config } from '../config.ts';
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

export interface OffsiteDestination {
    /** For logs and alerts. */
    readonly kind: 'drive' | 's3';
    /** Returns an opaque handle — a Drive file id, or an S3 key. */
    upload(name: string, body: Uint8Array): Promise<string>;
    /** Dumps already there, so retention can be applied off-site too. */
    list(): Promise<(BackupFile & { handle: string })[]>;
    remove(handle: string): Promise<void>;
}

/** `mawid-….dump.enc` → the dump name retention understands. */
function toBackupName(name: string): string {
    return name.replace(/\.enc$/, '');
}

function driveDestination(): OffsiteDestination | null {
    const { BACKUP_DRIVE_FOLDER_ID, BACKUP_DRIVE_CLIENT_EMAIL, BACKUP_DRIVE_PRIVATE_KEY } = config;

    if (!BACKUP_DRIVE_FOLDER_ID || !BACKUP_DRIVE_CLIENT_EMAIL || !BACKUP_DRIVE_PRIVATE_KEY) return null;

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

            return files.flatMap((file) => {
                const at = parseBackupFileName(toBackupName(file.name));
                // Anything else in the folder is somebody else's and is left
                // alone — pruning must never delete a file it cannot name.
                return at ? [{ name: file.name, at, handle: file.id }] : [];
            });
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

            return (listed.contents ?? []).flatMap((entry) => {
                const at = parseBackupFileName(toBackupName(entry.key.slice(prefix.length)));
                return at ? [{ name: entry.key, at, handle: entry.key }] : [];
            });
        },
        remove: (handle) => client.delete(handle),
    };
}

/** Null when no off-site destination is configured; uploads are then skipped. */
export function offsiteDestination(): OffsiteDestination | null {
    return driveDestination() ?? s3Destination();
}
