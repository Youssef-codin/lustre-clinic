import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, type Db, getSqlite, openDb } from '../../src/db/index.ts';

/**
 * Integration tests run against a real SQLite file rather than a mock — with
 * SQLite that costs a temp directory, and it means the overlap check and the
 * UNIQUE constraints are exercised by the same engine the clinic runs.
 */

let dir: string | null = null;

export function openTestDb(): Db {
    // Test files share a process, so a file that failed to clean up must not
    // hand its database to the next one — `openDb` is a no-op if one is open.
    closeDb();
    dir = mkdtempSync(join(tmpdir(), 'mawid-test-'));
    return openDb(join(dir, 'test.sqlite'));
}

export function closeTestDb(): void {
    closeDb();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
}

/** Empties every table between tests without re-running migrations. */
export function resetDb(): void {
    const sqlite = getSqlite();
    sqlite.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['reminders', 'appointments', 'patients']) {
        sqlite.exec(`DELETE FROM ${table}`);
        sqlite.run('DELETE FROM sqlite_sequence WHERE name = ?', [table]);
    }
    sqlite.exec('PRAGMA foreign_keys = ON');
}
