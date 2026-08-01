import type { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { MIGRATIONS } from './migrations.generated.ts';

/**
 * Migrations are applied on boot from SQL embedded in the binary, not read from
 * a folder beside it. Two clinics run installs that are not easy to reach, so
 * "which schema version is this clinic on" must never depend on whether a
 * `migrations/` directory survived the copy to the clinic PC — see spec §5.
 *
 * The bookkeeping table and hashing match drizzle's own migrator, so
 * `drizzle-kit` keeps working against a clinic database if it is ever needed.
 */

const BOOKKEEPING = `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at NUMERIC
)`;

export interface MigrationResult {
    /** How many migrations this boot applied. Zero on an up-to-date install. */
    applied: number;
    /** Tag of the newest applied migration, reported on `/api/health`. */
    version: string | null;
}

export function applyMigrations(sqlite: Database): MigrationResult {
    sqlite.exec(BOOKKEEPING);

    const seen = new Set(
        sqlite
            .query<{ hash: string }, []>('SELECT hash FROM __drizzle_migrations')
            .all()
            .map((row) => row.hash),
    );

    let applied = 0;

    for (const migration of MIGRATIONS) {
        const hash = createHash('sha256').update(migration.sql).digest('hex');
        if (seen.has(hash)) continue;

        // One transaction per migration: a failure half-way leaves the database
        // on the previous version rather than in a shape nothing expects.
        sqlite.transaction(() => {
            for (const statement of migration.sql.split('--> statement-breakpoint')) {
                const trimmed = statement.trim();
                if (trimmed.length > 0) sqlite.exec(trimmed);
            }
            sqlite.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [
                hash,
                migration.when,
            ]);
        })();

        applied += 1;
    }

    return { applied, version: MIGRATIONS.at(-1)?.tag ?? null };
}
