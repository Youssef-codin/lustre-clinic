import { databaseName } from '../../src/backup/pg.ts';
import { config } from '../../src/config.ts';
import { sql as dbSql } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrate.ts';

/**
 * Tests run against a real Postgres, because the things worth testing here are
 * enforced by Postgres — the `EXCLUDE` constraint above all. Point
 * `DATABASE_URL` at a scratch database; `docker compose up -d db` is enough.
 */
export const sql = dbSql;

/**
 * `truncateAll` runs in a `beforeEach` and empties every table. Nothing about
 * that is recoverable, so the suite refuses to start unless the database is
 * named like one that exists to be destroyed. `.env.test` supplies the name;
 * without this guard a plain `bun test` picks up `.env` and wipes the developer's
 * working database.
 */
const TEST_DATABASE_SUFFIX = '_test';

export function assertTestDatabase(url = config.DATABASE_URL): void {
    const name = databaseName(url);

    if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
        throw new Error(
            `refusing to run tests against "${name}": the suite truncates every table.\n` +
                `Point DATABASE_URL at a database whose name ends in "${TEST_DATABASE_SUFFIX}" — ` +
                `\`bun test\` reads packages/server/.env.test, which expects "${name}${TEST_DATABASE_SUFFIX}".\n` +
                `Create it once with: docker compose exec db createdb -U mawid ${name}${TEST_DATABASE_SUFFIX}`,
        );
    }
}

let migrated = false;

export async function setupDatabase(): Promise<void> {
    if (migrated) return;
    assertTestDatabase();
    await runMigrations();
    migrated = true;
}

/** Wipes every table. Order matters only in that CASCADE handles it for us. */
export async function truncateAll(): Promise<void> {
    await sql`
        TRUNCATE TABLE
            payments,
            visit_procedures,
            visits,
            reminders,
            appointments,
            patients,
            procedure_types,
            clinic_days,
            branches,
            custom_questions,
            settings
        RESTART IDENTITY CASCADE
    `;
}

export function uuid(): string {
    return Bun.randomUUIDv7();
}

export async function insertBranch(name = 'Main'): Promise<string> {
    const id = uuid();
    await sql`INSERT INTO branches (id, name) VALUES (${id}, ${name})`;
    return id;
}

export async function insertPatient(name = 'Test Patient'): Promise<string> {
    const id = uuid();
    await sql`INSERT INTO patients (id, name, phone) VALUES (${id}, ${name}, '+201000000000')`;
    return id;
}
