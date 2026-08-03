import { sql as raw } from 'drizzle-orm';
import { db, sql } from '../../db/index.ts';

export interface HealthReport {
    ok: boolean;
    db: boolean;
    /** Name of the most recently applied migration, or null if none have run. */
    migration: string | null;
}

/**
 * SPEC §13/§14. The client probes this on both the LAN address and the
 * Tailscale hostname and uses whichever answers first, so it must be cheap and
 * must not throw — an unreachable database is a reportable state, not an error.
 */
export const healthService = {
    async check(): Promise<HealthReport> {
        let dbOk = false;
        let migration: string | null = null;

        try {
            await db.execute(raw`SELECT 1`);
            dbOk = true;

            const rows = await sql<{ hash: string; created_at: string }[]>`
                SELECT hash, created_at
                FROM drizzle.__drizzle_migrations
                ORDER BY created_at DESC
                LIMIT 1
            `;
            migration = rows[0]?.hash ?? null;
        } catch {
            // Reported as db: false. Deliberately not rethrown.
        }

        return { ok: dbOk, db: dbOk, migration };
    },
};
