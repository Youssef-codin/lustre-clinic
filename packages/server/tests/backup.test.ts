import { beforeAll, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type BackupFile,
    backupFileName,
    decrypt,
    encrypt,
    generateKey,
    listLocalBackups,
    offsiteDestination,
    parseBackupFileName,
    parseKey,
    readLastSuccess,
    runBackup,
    selectForDeletion,
    selectOffsiteDumps,
    selectRetained,
} from '../src/backup/index.ts';
import { config } from '../src/config.ts';
import { insertBranch, insertPatient, setupDatabase, truncateAll } from './helpers/db.ts';

/**
 * SPEC §16. The end-to-end test dumps the real database, restores it into a
 * scratch database, and compares — which is the whole point of the section:
 * a dump nobody has restored is not a backup.
 */

describe('backup file names', () => {
    test('round-trips a timestamp', () => {
        const at = new Date('2026-08-03T08:41:32.000Z');
        const name = backupFileName(at);

        expect(name).toBe('mawid-2026-08-03T08-41-32Z.dump');
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
        expect(parseBackupFileName('mawid-nonsense.dump')).toBeNull();
    });
});

describe('retention', () => {
    /** One dump a day, newest first, ending on `end`. */
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

        // 14 daily + up to 8 weekly + up to 12 monthly, with overlap between
        // the sets — far fewer than the 400 that went in.
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
        // Two runs inside the same second produce the same file name. Matching
        // on name kept both forever — the bucket was full, so neither was ever
        // a deletion candidate. Retention has to tell them apart by identity.
        const at = new Date('2027-01-01T00:00:00Z');
        const first = { name: 'mawid-2027-01-01T00-00-00Z.dump', at };
        const second = { name: 'mawid-2027-01-01T00-00-00Z.dump', at };

        const retained = selectRetained([first, second], { daily: 1, weekly: 0, monthly: 0 });
        const doomed = selectForDeletion([first, second], { daily: 1, weekly: 0, monthly: 0 });

        expect(retained.size).toBe(1);
        expect(doomed.length).toBe(1);
        // Whichever was kept, the other one goes — and they are different objects.
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
        // The test environment sets neither Drive nor S3 credentials. If this
        // ever fails, `runBackup` in the suite below is talking to the network.
        expect(offsiteDestination()).toBeNull();
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
        // The safety property: the folder may hold anything, and retention only
        // ever sees the files it can name.
        const entries = [
            { name: dump, handle: 'ours' },
            { name: 'clinic-scans.zip', handle: 'theirs' },
            { name: 'mawid-nonsense.dump.enc', handle: 'malformed' },
            { name: 'notes.txt', handle: 'notes' },
        ];

        expect(selectOffsiteDumps(entries).map((f) => f.handle)).toEqual(['ours']);
        // Even a policy that keeps nothing cannot reach the strangers.
        const doomed = selectForDeletion(selectOffsiteDumps(entries), { daily: 0, weekly: 0, monthly: 0 });
        expect(doomed.map((f) => f.handle)).toEqual(['ours']);
    });

    test('carries the handle through retention, so deletion never looks up by name', () => {
        // Two runs in the same second: same name, two distinct files off-site.
        // Listed in one call, as `pruneOffsite` lists them — not one at a time.
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
        // The retained side of the same problem: both copies fill the newest
        // bucket, so a name-keyed policy never proposed either for deletion.
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
        // Flip a bit in the authentication tag.
        envelope.writeUInt8(envelope.readUInt8(envelope.length - 1) ^ 0xff, envelope.length - 1);

        expect(() => decrypt(envelope, key)).toThrow();
    });

    test('refuses the wrong key', () => {
        const envelope = encrypt(new TextEncoder().encode('body'), parseKey(generateKey()));

        expect(() => decrypt(envelope, parseKey(generateKey()))).toThrow();
    });

    test('refuses a file that is not an envelope', () => {
        expect(() => decrypt(new TextEncoder().encode('just a dump'), parseKey(generateKey()))).toThrow(
            'not a mawid backup envelope',
        );
    });
});

/**
 * Needs `pg_dump`/`pg_restore` and a reachable database. Skipped rather than
 * failed on a workstation that lacks them, so the unit tests above still run —
 * but never in CI, where a silent skip would mean the one test that proves a
 * dump can be restored quietly stops running (§16).
 *
 * Resolved through `PG_BIN_DIR` the same way `backup/pg.ts` does, so this probes
 * the binary the backup will actually invoke. Checking a bare `pg_dump` instead
 * would answer for a different one — on a host where PATH holds an older major
 * version, which is precisely when `PG_BIN_DIR` is set.
 */
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
    const directory = join(tmpdir(), `mawid-backup-test-${Bun.randomUUIDv7()}`);

    beforeAll(async () => {
        await setupDatabase();
        await truncateAll();
        await insertPatient();
        await insertBranch();
    });

    test('dumps, verifies by restoring, prunes, and records success', async () => {
        try {
            // `offsite: false` is not decoration. Without it a developer or a
            // runner with Drive credentials in the environment uploads this
            // throwaway dump to the clinic's real folder and prunes it against
            // the 2027 timestamp below.
            const result = await runBackup({
                directory,
                now: new Date('2027-01-01T00:00:00Z'),
                offsite: false,
            });

            expect(result.bytes).toBeGreaterThan(0);
            expect(result.verified).toBe(true);
            // No off-site destination configured in tests.
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
