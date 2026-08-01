/**
 * Applies migrations to the configured database without booting the server.
 * The server does this itself at startup; this exists for a manual run against
 * a clinic install, and for CI.
 */
import { loadConfig } from '../src/config/index.ts';
import { closeDb, openDb } from '../src/db/index.ts';
import { logger } from '../src/middleware/logger.ts';
import { getStatus } from '../src/services/status.ts';

const config = loadConfig();
openDb(config.database);
logger.info({ migration: getStatus().migration }, 'migrations up to date');
closeDb();
