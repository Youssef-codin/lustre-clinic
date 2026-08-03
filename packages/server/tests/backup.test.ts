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
    parseBackupFileName,
    parseKey,
    readLastSuccess,
    runBackup,
    selectForDeletion,
    selectRetained,
} from '../src/backup/index.ts';
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
            expect(retained.has(file.name)).toBe(true);
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

        expect(retained.has('b')).toBe(true);
        expect(retained.has('a')).toBe(false);
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
 * Needs `pg_dump`/`pg_restore` on PATH and a reachable database. Skipped rather
 * than failed where they are absent, so the unit tests above still run.
 */
const hasPgTools = await (async () => {
    try {
        return (
            (await Bun.spawn(['pg_dump', '--version'], { stdout: 'ignore', stderr: 'ignore' }).exited) === 0
        );
    } catch {
        return false;
    }
})();

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
            const result = await runBackup({ directory, now: new Date('2027-01-01T00:00:00Z') });

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
