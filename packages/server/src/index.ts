/**
 * Entrypoint (SPEC §4): migrate → background services → listen.
 *
 * Background services (`background/reminder.job.ts`, `background/backup.job.ts`)
 * are started here once they exist.
 */
import { config } from './config.ts';
import { runMigrations } from './db/migrate.ts';
import { logger } from './logger.ts';
import { createServer } from './server.ts';

await runMigrations();
logger.info('migrations applied');

const server = createServer();

logger.info({ port: server.port }, 'mawid server listening');

function shutdown(signal: string) {
    logger.info({ signal }, 'shutting down');
    server.stop();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { config };
