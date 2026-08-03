import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index.ts';

/** Migration SQL lives next to the schema so it ships with the server. */
const MIGRATIONS_FOLDER = new URL('./migrations', import.meta.url).pathname;

export async function runMigrations(): Promise<void> {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
