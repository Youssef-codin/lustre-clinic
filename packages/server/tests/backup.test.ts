import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DriveReauthorizationRequiredError } from '../src/backup/drive.ts';
import {
    type BackupFile,
    backupFailureAlert,
    backupFileName,
    clearOffsiteState,
    decrypt,
    encrypt,
    generateKey,
    listLocalBackups,
    offsiteDestination,
    parseBackupFileName,
    parseKey,
    readLastSuccess,
    readOffsiteState,
    recordOffsiteFailure,
    runBackup,
    selectForDeletion,
    selectOffsiteDumps,
    selectRetained,
} from '../src/backup/index.ts';
import { config } from '../src/config.ts';
import { backupService } from '../src/modules/backup/backup.service.ts';
import { insertBranch, insertPatient, setupDatabase, truncateAll } from './helpers/db.ts';

/**
 * SPEC §16. The end-to-end test dumps the real database, restores it into a
 * scratch database, and compares — a dump nobody has restored is not a backup.
 *
 * Retention and pruning must tell dumps apart by identity, not name: two runs
 * inside the same second share a file name, and a name-keyed policy keeps them
 * both forever. Retention only ever sees files it can name, so strangers in the
 * off-site folder are never touched. The `runBackup` suite needs
 * pg_dump/pg_restore and a reachable database; it is skipped on workstations
 * that lack them but never in CI, and resolves the binaries through PG_BIN_DIR
 * exactly as the backup code does. It runs with `offsite: false` so a
 * throwaway dump never reaches a real Drive folder when credentials exist.
 */

describe('backup file names', () => {
    test('round-trips a timestamp', () => {
        const at = new Date('2026-08-03T08:41:32.000Z');
        const name = backupFileName(at);

        expect(name).toBe('lustre-2026-08-03T08-41-32Z.dump');
        expect(parseBackupFileName(name)?.toISOString()).toBe(at.toISOString());
    });

    test('sorts lexically in the same order as chronologically', () => {
        const a = backupFileName(new Date('2026-08-03T08:00:00Z'));
        const b = backupFileName(new Date('2026-08-03T09:00:00Z'));
        const c = backupFileName(new Date('2026-09-01T00:00:00Z'));

        expect([c, a, b].sort()).toEqual([a, b, c]);
    });

    test('ignores anything that is not a dump', () => {
        expect(parseBackupFileName('last-success.json')).toBeNull();
        expect(parseBackupFileName('notes.txt')).toBeNull();
        expect(parseBackupFileName('lustre-nonsense.dump')).toBeNull();
    });
});

describe('retention', () => {
    function daily(days: number, end = new Date('2027-01-01T00:00:00Z')): BackupFile[] {
        return Array.from({ length: days }, (_, i) => {
            const at = new Date(end.getTime() - i * 86_400_000);
            return { name: backupFileName(at), at };
        });
    }

    test('keeps everything when there is less than the daily allowance', () => {
        const files = daily(10);
        expect(selectForDeletion(files)).toEqual([]);
    });

    test('keeps the 14 most recent days', () => {
        const files = daily(60);
        const retained = selectRetained(files);

        for (const file of files.slice(0, 14)) {
            expect(retained.has(file)).toBe(true);
        }
    });

    test('thins older dumps to weeklies and monthlies', () => {
        const files = daily(400);
        const retained = selectRetained(files);

        expect(retained.size).toBeLessThanOrEqual(14 + 8 + 12);
        expect(retained.size).toBeGreaterThan(20);
        expect(selectForDeletion(files).length).toBe(files.length - retained.size);
    });

    test('keeps the newest dump of a day when several were taken', () => {
        const morning = { name: 'a', at: new Date('2027-01-01T06:00:00Z') };
        const evening = { name: 'b', at: new Date('2027-01-01T20:00:00Z') };
        const retained = selectRetained([morning, evening], { daily: 1, weekly: 0, monthly: 0 });

        expect(retained.has(evening)).toBe(true);
        expect(retained.has(morning)).toBe(false);
    });

    test('keeps one of two dumps that share a name, and deletes the other', () => {
        const at = new Date('2027-01-01T00:00:00Z');
        const first = { name: 'lustre-2027-01-01T00-00-00Z.dump', at };
        const second = { name: 'lustre-2027-01-01T00-00-00Z.dump', at };

        const retained = selectRetained([first, second], { daily: 1, weekly: 0, monthly: 0 });
        const doomed = selectForDeletion([first, second], { daily: 1, weekly: 0, monthly: 0 });

        expect(retained.size).toBe(1);
        expect(doomed.length).toBe(1);
        expect(retained.has(doomed[0] as (typeof doomed)[number])).toBe(false);
    });

    test('a dump older than every window is deleted', () => {
        const files = [
            { name: 'recent', at: new Date('2027-01-01T00:00:00Z') },
            { name: 'ancient', at: new Date('2020-01-01T00:00:00Z') },
        ];
        const doomed = selectForDeletion(files, { daily: 1, weekly: 1, monthly: 1 });

        expect(doomed.map((f) => f.name)).toEqual(['ancient']);
    });
});

describe('offsiteDestination', () => {
    test('is null when nothing is configured, so a run stays local', () => {
        expect(offsiteDestination()).toBeNull();
    });
});

describe('backup failure alerts', () => {
    test('tells the operator to reauthorize Drive when the refresh grant is invalid', () => {
        const alert = backupFailureAlert(
            new DriveReauthorizationRequiredError(),
            'lustre-2026-08-03T08-41-32Z.dump',
        );

        expect(alert.code).toBe('backup.drive_reauthorization_required');
        expect(alert.summary).toContain('drive:authorize');
        expect(alert.context).not.toHaveProperty('error');
    });
});

describe('a revoked Drive grant outlives the run that found it', () => {
    async function scratch(): Promise<string> {
        const directory = join(tmpdir(), `lustre-offsite-${Bun.randomUUIDv7()}`);
        await mkdir(directory, { recursive: true });
        return directory;
    }

    test('nothing is recorded until a grant actually fails', async () => {
        const directory = await scratch();
        try {
            expect(await readOffsiteState(directory)).toBeNull();

            await recordOffsiteFailure(directory, new Error('pg_dump produced an empty file'), new Date());
            expect(await readOffsiteState(directory)).toBeNull();
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    test('keeps the first failure, so the age shown does not reset every night', async () => {
        const directory = await scratch();
        try {
            const first = new Date('2026-09-17T03:00:00Z');
            await recordOffsiteFailure(directory, new DriveReauthorizationRequiredError(), first);
            await recordOffsiteFailure(
                directory,
                new DriveReauthorizationRequiredError(),
                new Date('2026-09-20T03:00:00Z'),
            );

            expect(await readOffsiteState(directory)).toEqual({
                reauthorizationRequiredSince: first.toISOString(),
            });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    test('a later upload clears it', async () => {
        const directory = await scratch();
        try {
            await recordOffsiteFailure(directory, new DriveReauthorizationRequiredError(), new Date());
            expect(await readOffsiteState(directory)).not.toBeNull();

            await clearOffsiteState(directory);
            expect(await readOffsiteState(directory)).toBeNull();

            // Clearing what is already clear is what every healthy run does.
            await clearOffsiteState(directory);
            expect(await readOffsiteState(directory)).toBeNull();
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    test('a directory that is not there reads as no state, not as a crash', async () => {
        expect(await readOffsiteState(join(tmpdir(), `lustre-missing-${Bun.randomUUIDv7()}`))).toBeNull();
    });
});

describe('backup.status', () => {
    test('reports a clinic that has never backed up as stale, not as an error', async () => {
        const status = await backupService.status();

        expect(status.lastSuccessAt).toBeNull();
        expect(status.stale).toBe(true);
        expect(status.staleAfterHours).toBe(config.BACKUP_STALE_AFTER_HOURS);
        // `.env.test` leaves every Drive and S3 field empty on purpose (§16).
        expect(status.offsite).toEqual({ configured: false, reauthorizationRequiredSince: null });
    });
});

describe('off-site listings', () => {
    const dump = `${backupFileName(new Date('2027-01-01T00:00:00Z'))}.enc`;

    test('reads the timestamp back out of an encrypted dump name', () => {
        const [file] = selectOffsiteDumps([{ name: dump, handle: 'drive-id-1' }]);

        expect(file?.at.toISOString()).toBe('2027-01-01T00:00:00.000Z');
        expect(file?.handle).toBe('drive-id-1');
    });

    test('a file whose name is not a dump is never a candidate for pruning', () => {
        const entries = [
            { name: dump, handle: 'ours' },
            { name: 'clinic-scans.zip', handle: 'theirs' },
            { name: 'lustre-nonsense.dump.enc', handle: 'malformed' },
            { name: 'notes.txt', handle: 'notes' },
        ];

        expect(selectOffsiteDumps(entries).map((f) => f.handle)).toEqual(['ours']);
        const doomed = selectForDeletion(selectOffsiteDumps(entries), { daily: 0, weekly: 0, monthly: 0 });
        expect(doomed.map((f) => f.handle)).toEqual(['ours']);
    });

    test('carries the handle through retention, so deletion never looks up by name', () => {
        const older = `${backupFileName(new Date('2020-01-01T00:00:00Z'))}.enc`;
        const doomed = selectForDeletion(
            selectOffsiteDumps([
                { name: dump, handle: 'newest' },
                { name: older, handle: 'copy-a' },
                { name: older, handle: 'copy-b' },
            ]),
            { daily: 1, weekly: 1, monthly: 1 },
        );

        expect(doomed.map((f) => f.handle).sort()).toEqual(['copy-a', 'copy-b']);
    });

    test('a duplicate of the newest dump is pruned rather than kept forever', () => {
        const doomed = selectForDeletion(
            selectOffsiteDumps([
                { name: dump, handle: 'keep-one' },
                { name: dump, handle: 'keep-two' },
            ]),
            { daily: 1, weekly: 1, monthly: 1 },
        );

        expect(doomed.length).toBe(1);
        expect(['keep-one', 'keep-two']).toContain(doomed[0]?.handle ?? '');
    });
});

describe('encryption', () => {
    test('round-trips a payload', () => {
        const key = parseKey(generateKey());
        const plaintext = new TextEncoder().encode('PGDMP fake dump body');

        expect(decrypt(encrypt(plaintext, key), key)).toEqual(Buffer.from(plaintext));
    });

    test('accepts a hex key and a base64 key', () => {
        expect(parseKey(Buffer.alloc(32, 7).toString('hex')).length).toBe(32);
        expect(parseKey(Buffer.alloc(32, 7).toString('base64')).length).toBe(32);
    });

    test('rejects a key of the wrong length', () => {
        expect(() => parseKey('too-short')).toThrow();
        expect(() => parseKey(Buffer.alloc(16).toString('base64'))).toThrow();
    });

    test('the ciphertext does not contain the plaintext', () => {
        const key = parseKey(generateKey());
        const secret = 'patient-name-that-must-not-leak';
        const envelope = encrypt(new TextEncoder().encode(secret), key);

        expect(envelope.toString('binary')).not.toContain(secret);
    });

    test('refuses a payload that has been tampered with', () => {
        const key = parseKey(generateKey());
        const envelope = encrypt(new TextEncoder().encode('body'), key);
        envelope.writeUInt8(envelope.readUInt8(envelope.length - 1) ^ 0xff, envelope.length - 1);

        expect(() => decrypt(envelope, key)).toThrow();
    });

    test('refuses the wrong key', () => {
        const envelope = encrypt(new TextEncoder().encode('body'), parseKey(generateKey()));

        expect(() => decrypt(envelope, parseKey(generateKey()))).toThrow();
    });

    test('refuses a file that is not an envelope', () => {
        expect(() => decrypt(new TextEncoder().encode('just a dump'), parseKey(generateKey()))).toThrow(
            'not a lustre backup envelope',
        );
    });
});

function pgBinary(program: string): string {
    return config.PG_BIN_DIR ? join(config.PG_BIN_DIR, program) : program;
}

async function isRunnable(program: string): Promise<boolean> {
    try {
        return (
            (await Bun.spawn([pgBinary(program), '--version'], { stdout: 'ignore', stderr: 'ignore' })
                .exited) === 0
        );
    } catch {
        return false;
    }
}

const hasPgTools = (await isRunnable('pg_dump')) && (await isRunnable('pg_restore'));

if (!hasPgTools && Bun.env.CI) {
    throw new Error(
        `pg_dump/pg_restore are not runnable (PG_BIN_DIR=${config.PG_BIN_DIR ?? 'unset'}). ` +
            'The backup restore test is the only proof a dump is usable, and CI must ' +
            'not skip it — install postgresql-client.',
    );
}

describe.skipIf(!hasPgTools)('runBackup', () => {
    const directory = join(tmpdir(), `lustre-backup-test-${Bun.randomUUIDv7()}`);

    beforeAll(async () => {
        await setupDatabase();
        await truncateAll();
        await insertPatient();
        await insertBranch();
    });

    test('dumps, verifies by restoring, prunes, and records success', async () => {
        try {
            const result = await runBackup({
                directory,
                now: new Date('2027-01-01T00:00:00Z'),
                offsite: false,
            });

            expect(result.bytes).toBeGreaterThan(0);
            expect(result.verified).toBe(true);
            expect(result.offsiteKey).toBeNull();

            const files = await listLocalBackups(directory);
            expect(files.map((f) => f.name)).toContain(result.file);

            const marker = await readLastSuccess(directory);
            expect(marker?.file).toBe(result.file);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }, 60_000);
});
