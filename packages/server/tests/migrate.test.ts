import { beforeAll, describe, expect, test } from 'bun:test';
import postgres from 'postgres';
import { withScratchDatabase } from '../src/backup/pg.ts';
import { config } from '../src/config.ts';
import { setupDatabase, sql } from './helpers/db.ts';

/**
 * SPEC §5 — the schema, and the migrations that produce it.
 *
 * Nothing checked that migrations apply to an *empty* database. Every suite
 * calls `setupDatabase`, which is a no-op after the first run, so the path a
 * fresh clinic machine takes on its very first boot (§15) was never exercised.
 *
 * The scratch database also gives the truncation list somewhere to be checked
 * against: a table added to the schema and forgotten in `truncateAll` does not
 * fail, it leaks rows into whichever test runs next.
 */

/** Every table `helpers/db.ts` empties between tests. */
const TRUNCATED_TABLES = [
    'payments',
    'visit_procedures',
    'visits',
    'reminders',
    'appointments',
    'patients',
    'procedure_types',
    'clinic_days',
    'branches',
    'custom_questions',
    'settings',
] as const;

async function tablesIn(client: postgres.Sql): Promise<string[]> {
    const rows = await client<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    return rows.map((r) => r.tablename);
}

beforeAll(async () => {
    await setupDatabase();
});

describe('migrations', () => {
    test('apply to an empty database, and are idempotent', async () => {
        const scratch = `mawid_migrate_${Date.now()}_test`;

        await withScratchDatabase(config.DATABASE_URL, scratch, async (scratchUrl) => {
            // `runMigrations` binds to the shared `db` client, so a second
            // client is pointed at the scratch database and drizzle's migrator
            // is driven directly against it.
            const client = postgres(scratchUrl, { max: 1, onnotice: () => {} });

            try {
                const { drizzle } = await import('drizzle-orm/postgres-js');
                const { migrate } = await import('drizzle-orm/postgres-js/migrator');
                const migrationsFolder = new URL('../src/db/migrations', import.meta.url).pathname;
                const scratchDb = drizzle(client);

                await migrate(scratchDb, { migrationsFolder });
                const afterFirst = await tablesIn(client);

                // Booting twice is normal: the entrypoint migrates on every
                // start (§4), so a second pass must be a no-op rather than an
                // error about something that already exists.
                await migrate(scratchDb, { migrationsFolder });
                const afterSecond = await tablesIn(client);

                expect(afterFirst.length).toBeGreaterThan(0);
                expect(afterSecond).toEqual(afterFirst);
            } finally {
                await client.end();
            }
        });
    }, 60_000);

    test('install btree_gist, without which the overlap constraint cannot exist', async () => {
        const [row] = await sql<{ present: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') AS present
        `;
        expect(row?.present).toBe(true);
    });

    test('create appointments_no_overlap', async () => {
        // §5 calls this the one thing the schema cannot be without: double
        // booking is prevented by Postgres, not by application code.
        const [row] = await sql<{ present: boolean }[]>`
            SELECT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap'
            ) AS present
        `;
        expect(row?.present).toBe(true);
    });

    test('create the appointment_span helper', async () => {
        const [row] = await sql<{ present: boolean }[]>`
            SELECT EXISTS (
                SELECT 1 FROM pg_proc WHERE proname = 'appointment_span'
            ) AS present
        `;
        expect(row?.present).toBe(true);
    });

    test('declare appointment_span IMMUTABLE, as the exclusion index requires', async () => {
        // A GiST exclusion constraint may only index an immutable expression.
        // Declared volatile, the migration fails; declared immutable but
        // *behaving* volatilely, the index silently rots — which is what the
        // session-timezone test in overlap.test.ts guards.
        const [row] = await sql<{ volatility: string }[]>`
            SELECT provolatile AS volatility FROM pg_proc WHERE proname = 'appointment_span'
        `;
        expect(row?.volatility).toBe('i');
    });
});

describe('schema and the truncation list', () => {
    test('every table the suite truncates exists', async () => {
        const present = await tablesIn(sql);

        for (const table of TRUNCATED_TABLES) {
            expect(present).toContain(table);
        }
    });

    test('every table in the schema is truncated between tests', async () => {
        // The one that actually catches something: a new table added to the
        // schema but not to `truncateAll` keeps its rows across tests, and the
        // failure surfaces somewhere unrelated and much later.
        const present = await tablesIn(sql);
        const untracked = present.filter(
            (table) =>
                !(TRUNCATED_TABLES as readonly string[]).includes(table) &&
                // drizzle's own bookkeeping, which must survive truncation.
                table !== '__drizzle_migrations',
        );

        expect(untracked).toEqual([]);
    });
});
