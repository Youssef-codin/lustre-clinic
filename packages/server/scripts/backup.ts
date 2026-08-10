/**
 * Runs one backup now (SPEC §16), through the same code path as the scheduled
 * job — running this is a real rehearsal of the nightly run. Errors are already
 * logged and alerted by `runBackup`.
 *
 *   bun packages/server/scripts/backup.ts
 */

import { runBackup } from '../src/backup/index.ts';
import { logger } from '../src/logger.ts';

try {
    const result = await runBackup();
    logger.info({ file: result.file, bytes: result.bytes }, 'backup written');
} catch {
    process.exitCode = 1;
}
