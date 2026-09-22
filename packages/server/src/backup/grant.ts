/**
 * SPEC §16 — the Drive grant the doctor made from the phone, as opposed to the
 * one the operator pasted into the environment.
 *
 * The environment is read once at boot and cannot change while the server runs,
 * so a sign-in done from a handset has nowhere to go without this. It is a file
 * beside the dumps rather than a `settings` row because backups must keep
 * working when the database is the thing that is broken — `backup.status` and
 * the job already read files for the same reason.
 *
 * It holds a refresh token, so it is written 0600 and through a temporary file
 * and a rename: a torn read here would drop the clinic back to whatever the
 * environment says, which is a different Drive account.
 */
import { chmod, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.ts';

const GRANT_FILE = 'drive-grant.json';

export interface DriveGrant {
    clientId: string;
    refreshToken: string;
    folderId: string;
    /** Who consented, for the operator reading the file. Never logged, never sent. */
    account?: string;
    linkedAt: string;
}

export async function readDriveGrant(directory = config.BACKUP_DIR): Promise<DriveGrant | null> {
    try {
        const grant = (await Bun.file(join(directory, GRANT_FILE)).json()) as DriveGrant;
        return grant.clientId && grant.refreshToken && grant.folderId ? grant : null;
    } catch {
        return null;
    }
}

export async function writeDriveGrant(grant: DriveGrant, directory = config.BACKUP_DIR): Promise<void> {
    const target = join(directory, GRANT_FILE);
    const scratch = `${target}.${process.pid}.tmp`;
    await Bun.write(scratch, JSON.stringify(grant, null, 2));
    await chmod(scratch, 0o600);
    await rename(scratch, target);
}

export async function clearDriveGrant(directory = config.BACKUP_DIR): Promise<void> {
    await unlink(join(directory, GRANT_FILE)).catch(() => {});
}
