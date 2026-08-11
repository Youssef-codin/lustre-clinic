/**
 * SPEC §16. One backup run is: dump → verify by restoring → copy off-site
 * encrypted → prune. Every step that can fail alerts (§17), and the run records
 * its success so the staleness check has something to look at.
 *
 * Verification restores the dump into a scratch database and compares row
 * counts — and that `appointments_no_overlap` survived, since losing it
 * restores a broken clinic. The off-site upload refuses to run without
 * `BACKUP_ENCRYPTION_KEY`: patient data must not leave the clinic in the clear.
 * Pruning is off by default in tests because a run with real credentials in the
 * environment uploads to the clinic's actual Drive folder and prunes it against
 * the run's own timestamp.
 */
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { config } from '../config.ts';
import { logger } from '../logger.ts';
import { alert } from '../monitoring/index.ts';
import { encrypt, parseKey } from './crypto.ts';
import { offsiteDestination } from './destination.ts';
import { databaseName, pgDump, pgRestore, withScratchDatabase } from './pg.ts';
import {
    type BackupFile,
    backupFileName,
    DEFAULT_RETENTION,
    parseBackupFileName,
    type RetentionPolicy,
    selectForDeletion,
} from './retention.ts';

export * from './crypto.ts';
export * from './destination.ts';
export * from './retention.ts';

const MARKER_FILE = 'last-success.json';

export interface BackupResult {
    readonly file: string;
    readonly bytes: number;
    readonly verified: boolean;
    readonly offsiteKey: string | null;
    readonly pruned: readonly string[];
}

export interface BackupOptions {
    databaseUrl?: string;
    directory?: string;
    retention?: RetentionPolicy;
    now?: Date;
    verify?: boolean;
    offsite?: boolean;
}

export async function listLocalBackups(directory: string): Promise<BackupFile[]> {
    let names: string[];
    try {
        names = await readdir(directory);
    } catch {
        return [];
    }

    const files: BackupFile[] = [];
    for (const name of names) {
        const at = parseBackupFileName(name);
        if (at) files.push({ name, at });
    }
    return files.sort((a, b) => b.at.getTime() - a.at.getTime());
}

async function verifyDump(databaseUrl: string, dumpFile: string, at: Date): Promise<void> {
    const counted = ['patients', 'appointments', 'visits', 'payments'] as const;

    const source = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    let expected: Record<string, number>;
    try {
        expected = await countRows(source, counted);
    } finally {
        await source.end();
    }

    const scratch = `${databaseName(databaseUrl)}_verify_${at.getTime()}`;

    await withScratchDatabase(databaseUrl, scratch, async (scratchUrl) => {
        await pgRestore(scratchUrl, dumpFile);

        const restored = postgres(scratchUrl, { max: 1, onnotice: () => {} });
        try {
            const actual = await countRows(restored, counted);

            for (const table of counted) {
                if (actual[table] !== expected[table]) {
                    throw new Error(
                        `restored ${table} has ${actual[table]} rows, source had ${expected[table]}`,
                    );
                }
            }

            const [row] = await restored<{ present: boolean }[]>`
                SELECT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap'
                ) AS present
            `;
            if (!row?.present) {
                throw new Error('restored database is missing appointments_no_overlap');
            }
        } finally {
            await restored.end();
        }
    });
}

async function countRows(sql: postgres.Sql, tables: readonly string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of tables) {
        const [row] = await sql.unsafe<{ n: string }[]>(`SELECT count(*)::text AS n FROM "${table}"`);
        counts[table] = Number(row?.n ?? 0);
    }
    return counts;
}

async function uploadOffsite(localPath: string, name: string): Promise<string | null> {
    const destination = offsiteDestination();
    if (!destination) return null;

    if (!config.BACKUP_ENCRYPTION_KEY) {
        throw new Error(
            'an off-site destination is configured but BACKUP_ENCRYPTION_KEY is not — refusing to upload',
        );
    }

    const plaintext = await Bun.file(localPath).bytes();
    const handle = await destination.upload(
        `${name}.enc`,
        encrypt(plaintext, parseKey(config.BACKUP_ENCRYPTION_KEY)),
    );

    logger.info({ destination: destination.kind, file: name }, 'off-site copy uploaded');
    return handle;
}

async function pruneLocal(directory: string, policy: RetentionPolicy): Promise<string[]> {
    const doomed = selectForDeletion(await listLocalBackups(directory), policy);

    for (const file of doomed) {
        await unlink(join(directory, file.name));
    }
    return doomed.map((f) => f.name);
}

async function pruneOffsite(policy: RetentionPolicy): Promise<number> {
    const destination = offsiteDestination();
    if (!destination) return 0;

    const doomed = selectForDeletion(await destination.list(), policy);

    for (const file of doomed) {
        await destination.remove(file.handle);
    }
    return doomed.length;
}

export interface BackupMarker {
    at: string;
    file: string;
    bytes: number;
}

export async function readLastSuccess(directory = config.BACKUP_DIR): Promise<BackupMarker | null> {
    try {
        return (await Bun.file(join(directory, MARKER_FILE)).json()) as BackupMarker;
    } catch {
        return null;
    }
}

export async function runBackup(options: BackupOptions = {}): Promise<BackupResult> {
    const {
        databaseUrl = config.DATABASE_URL,
        directory = config.BACKUP_DIR,
        retention = DEFAULT_RETENTION,
        now = new Date(),
        verify = true,
        offsite = true,
    } = options;

    const name = backupFileName(now);
    const path = join(directory, name);

    try {
        await mkdir(directory, { recursive: true });

        await pgDump(databaseUrl, path);
        const { size } = await stat(path);
        if (size === 0) throw new Error('pg_dump produced an empty file');

        if (verify) await verifyDump(databaseUrl, path, now);

        const offsiteKey = offsite ? await uploadOffsite(path, name) : null;

        const pruned = await pruneLocal(directory, retention);
        const prunedOffsite = offsite ? await pruneOffsite(retention) : 0;

        const marker: BackupMarker = { at: now.toISOString(), file: name, bytes: size };
        await Bun.write(join(directory, MARKER_FILE), JSON.stringify(marker));

        logger.info(
            {
                file: name,
                bytes: size,
                verified: verify,
                offsite: offsiteKey !== null,
                pruned: pruned.length,
                prunedOffsite,
            },
            'backup complete',
        );

        return { file: name, bytes: size, verified: verify, offsiteKey, pruned };
    } catch (err) {
        logger.error({ err }, 'backup failed');
        await alert({
            code: 'backup.failed',
            summary: 'A backup run failed. The clinic is running without a fresh backup.',
            context: { file: name, error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' },
        });
        throw err;
    }
}
