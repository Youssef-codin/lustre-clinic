import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { logger } from '../middleware/logger.ts';
import { setStatus } from '../services/status.ts';
import { resolveConfigured } from '../util/paths.ts';
import { applyMigrations } from './migrate.ts';
import * as schema from './schema.ts';

export * as schema from './schema.ts';

export type Db = BunSQLiteDatabase<typeof schema> & { $client: Database };

/**
 * What a query can run against: the connection, or a transaction handle. A
 * service that takes a `Querier` can be called standalone or pulled into a
 * caller's transaction — which is how a booking creates its walk-in patient and
 * its appointment atomically.
 */
export type Querier = BaseSQLiteDatabase<'sync', void, typeof schema>;

interface Handle {
    db: Db;
    sqlite: Database;
    path: string;
}

let handle: Handle | null = null;

/**
 * WAL keeps a read (the desk screen refreshing) from blocking a write (the
 * secretary booking), which on a single clinic PC is the whole contention story.
 * `foreign_keys` is off by default in SQLite and has to be asked for per
 * connection, or the appointment → patient reference is decoration.
 */
function applyPragmas(sqlite: Database): void {
    sqlite.exec('PRAGMA journal_mode = WAL');
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec('PRAGMA synchronous = NORMAL');
    // A print or backup holding the file must not turn a booking into an error.
    sqlite.exec('PRAGMA busy_timeout = 5000');
}

/**
 * Opens the database, applies every committed migration, and records the
 * applied version for `/api/health`. Called once at boot before anything that
 * reads data starts — see spec §5.
 */
export function openDb(configuredPath: string): Db {
    if (handle) return handle.db;

    const path = configuredPath === ':memory:' ? configuredPath : resolveConfigured(configuredPath);
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

    const sqlite = new Database(path, { create: true });
    applyPragmas(sqlite);

    const db = drizzle(sqlite, { schema });
    const { applied, version } = applyMigrations(sqlite);

    setStatus('migration', version);
    setStatus('db', 'ok');
    logger.info({ path, migration: version, applied }, 'database ready');

    handle = { db, sqlite, path };
    return db;
}

export function getDb(): Db {
    if (!handle) throw new Error('Database accessed before openDb() ran');
    return handle.db;
}

/** The underlying connection, for `VACUUM INTO` backups and hand-written SQL. */
export function getSqlite(): Database {
    if (!handle) throw new Error('Database accessed before openDb() ran');
    return handle.sqlite;
}

export function getDbPath(): string | null {
    return handle?.path ?? null;
}

export function closeDb(): void {
    if (!handle) return;
    handle.sqlite.close();
    handle = null;
    setStatus('db', 'down');
}
