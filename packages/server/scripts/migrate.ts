/**
 * Applies pending migrations. Run standalone (`bun db:migrate`) and also on
 * boot from `src/index.ts` (SPEC §4: migrate → background services → listen).
 */

import { sql } from '../src/db/index.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { logger } from '../src/logger.ts';

try {
    await runMigrations();
    logger.info('migrations applied');
} catch (err) {
    logger.error({ err }, 'migration failed');
    process.exitCode = 1;
} finally {
    await sql.end();
}
