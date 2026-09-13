/**
 * Migration SQL lives next to the schema so it ships with the server.
 *
 * Migrations run as `MIGRATION_DATABASE_URL` when it is set: on the clinic
 * machine the pool the app uses belongs to a role that can read and write rows
 * but not create or alter tables.
 */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../config.ts';
import { db } from './index.ts';

// fileURLToPath, not `.pathname`: the latter keeps percent-encoding, so a
// checkout path with a space in it would name a folder that does not exist.
const MIGRATIONS_FOLDER = config.MIGRATIONS_DIR ?? fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(): Promise<void> {
    if (!config.MIGRATION_DATABASE_URL) {
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        return;
    }

    const owner = postgres(config.MIGRATION_DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
        await migrate(drizzle(owner), { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
        await owner.end();
    }
}
