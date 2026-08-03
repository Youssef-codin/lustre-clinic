import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { config } from '../config.ts';
import { logger } from '../logger.ts';
import { alert } from '../monitoring/index.ts';
import { encrypt, parseKey } from './crypto.ts';
import { databaseName, pgDump, pgRestore, withScratchDatabase } from './pg.ts';
import { type BackupFile, DEFAULT_RETENTION, type RetentionPolicy, selectForDeletion } from './retention.ts';

/**
 * SPEC §16. One backup run is: dump → verify by restoring → copy off-site
 * encrypted → prune. Every step that can fail alerts (§17), and the run records
 * its success so the staleness check has something to look at.
 */

export * from './crypto.ts';
export * from './retention.ts';

const FILE_PREFIX = 'mawid-';
const FILE_SUFFIX = '.dump';
/** Written after a successful run; read by the 48h staleness check. */
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
    /** Verification is the point of §16; only tests turn it off. */
    verify?: boolean;
}

/** `mawid-2026-08-03T08-41-32Z.dump` — sortable, filesystem-safe, UTC. */
export function backupFileName(at: Date): string {
    const stamp = at
        .toISOString()
        .replace(/\.\d+Z$/, 'Z')
        .replaceAll(':', '-');
    return `${FILE_PREFIX}${stamp}${FILE_SUFFIX}`;
}

export function parseBackupFileName(name: string): Date | null {
    if (!name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_SUFFIX)) return null;

    const stamp = name.slice(FILE_PREFIX.length, -FILE_SUFFIX.length);
    // Undo the `:` → `-` substitution in the time part only.
    const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z');
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? null : at;
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

/**
 * Restores the dump into a throwaway database and checks that what comes back
 * is the database that went in. Comparing row counts is what makes this a
 * verification rather than a "the command exited 0" check.
 */
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

            // The overlap constraint is the one thing the schema cannot be
            // without (§5). A restore that loses it restores a broken clinic.
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

function s3Client(): Bun.S3Client | null {
    if (!config.BACKUP_S3_BUCKET) return null;

    return new Bun.S3Client({
        bucket: config.BACKUP_S3_BUCKET,
        endpoint: config.BACKUP_S3_ENDPOINT,
        region: config.BACKUP_S3_REGION,
        accessKeyId: config.BACKUP_S3_ACCESS_KEY_ID,
        secretAccessKey: config.BACKUP_S3_SECRET_ACCESS_KEY,
    });
}

/**
 * Off-site copy. Encrypted first — the key is not on this machine, so a dump in
 * object storage is inert without the operator (§16).
 */
async function uploadOffsite(localPath: string, name: string): Promise<string | null> {
    const client = s3Client();
    if (!client) return null;

    if (!config.BACKUP_ENCRYPTION_KEY) {
        // Refusing is the safe failure: patient data must not leave the clinic
        // in the clear.
        throw new Error('BACKUP_S3_BUCKET is set but BACKUP_ENCRYPTION_KEY is not — refusing to upload');
    }

    const key = `${config.BACKUP_S3_PREFIX}/${name}.enc`;
    const plaintext = await Bun.file(localPath).bytes();
    await client.file(key).write(encrypt(plaintext, parseKey(config.BACKUP_ENCRYPTION_KEY)));
    return key;
}

async function pruneLocal(directory: string, policy: RetentionPolicy): Promise<string[]> {
    const doomed = selectForDeletion(await listLocalBackups(directory), policy);

    for (const file of doomed) {
        await unlink(join(directory, file.name));
    }
    return doomed.map((f) => f.name);
}

async function pruneOffsite(policy: RetentionPolicy): Promise<void> {
    const client = s3Client();
    if (!client) return;

    const prefix = `${config.BACKUP_S3_PREFIX}/`;
    const listed = await client.list({ prefix });

    const files: BackupFile[] = [];
    for (const entry of listed.contents ?? []) {
        const name = entry.key.slice(prefix.length).replace(/\.enc$/, '');
        const at = parseBackupFileName(name);
        if (at) files.push({ name: entry.key, at });
    }

    for (const file of selectForDeletion(files, policy)) {
        await client.delete(file.name);
    }
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

/** One full backup run. Throws on failure, after alerting. */
export async function runBackup(options: BackupOptions = {}): Promise<BackupResult> {
    const {
        databaseUrl = config.DATABASE_URL,
        directory = config.BACKUP_DIR,
        retention = DEFAULT_RETENTION,
        now = new Date(),
        verify = true,
    } = options;

    const name = backupFileName(now);
    const path = join(directory, name);

    try {
        await mkdir(directory, { recursive: true });

        await pgDump(databaseUrl, path);
        const { size } = await stat(path);
        if (size === 0) throw new Error('pg_dump produced an empty file');

        if (verify) await verifyDump(databaseUrl, path, now);

        const offsiteKey = await uploadOffsite(path, name);

        const pruned = await pruneLocal(directory, retention);
        await pruneOffsite(retention);

        const marker: BackupMarker = { at: now.toISOString(), file: name, bytes: size };
        await Bun.write(join(directory, MARKER_FILE), JSON.stringify(marker));

        logger.info(
            {
                file: name,
                bytes: size,
                verified: verify,
                offsite: offsiteKey !== null,
                pruned: pruned.length,
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
