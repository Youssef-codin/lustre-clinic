/**
 * Runs one backup now (SPEC §16). Same code path as the scheduled job, so
 * running this is a real rehearsal of the nightly run.
 *
 *   bun packages/server/scripts/backup.ts
 */

import { runBackup } from '../src/backup/index.ts';
import { logger } from '../src/logger.ts';

try {
    const result = await runBackup();
    logger.info({ file: result.file, bytes: result.bytes }, 'backup written');
} catch {
    // Already logged and alerted by runBackup.
    process.exitCode = 1;
}
