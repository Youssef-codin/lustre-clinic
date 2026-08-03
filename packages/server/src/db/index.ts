import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.ts';
import { schema } from './schema.ts';

/**
 * Drizzle over `postgres.js` (SPEC §2). Bun's native `Bun.sql` +
 * `drizzle-orm/bun-sql` is the newer alternative; `postgres.js` is the
 * documented default and is what this runs on until that matures.
 */
export const sql = postgres(config.DATABASE_URL, {
    // Two clients on a tailnet. A small pool is plenty and keeps the clinic
    // machine's memory use predictable.
    max: 10,
    onnotice: () => {},
});

export const db = drizzle(sql, { schema });

export type Db = typeof db;

/**
 * Either the pool or an open transaction. Services take one of these so a
 * multi-table operation — a walk-in creating an appointment and a visit
 * together (§7) — can be composed without duplicating the query code.
 */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export { schema };
