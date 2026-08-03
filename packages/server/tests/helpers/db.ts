import { sql as dbSql } from '../../src/db/index.ts';
import { runMigrations } from '../../src/db/migrate.ts';

/**
 * Tests run against a real Postgres, because the things worth testing here are
 * enforced by Postgres — the `EXCLUDE` constraint above all. Point
 * `DATABASE_URL` at a scratch database; `docker compose up -d db` is enough.
 */
export const sql = dbSql;

let migrated = false;

export async function setupDatabase(): Promise<void> {
    if (migrated) return;
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
