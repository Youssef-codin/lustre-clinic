import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../../../config/index.ts';
import { logger } from '../../../middleware/logger.ts';
import { resolveConfigured } from '../../../util/paths.ts';
import type { PrintDriver, PrintJob } from '../driver.ts';

/**
 * Writes the PDF to a folder instead of printing it. The development driver,
 * and the manual escape hatch when a printer is misbehaving at the clinic —
 * the secretary can open the folder and print by hand. See spec §7.
 */
export function fileDriver(config: Config): PrintDriver {
    const dir = resolveConfigured(config.printing.outputDir ?? './print-out');

    return {
        name: 'file',

        async available() {
            try {
                mkdirSync(dir, { recursive: true });
                return true;
            } catch (err) {
                logger.error({ err, dir }, 'print output folder is not writable');
                return false;
            }
        },

        async print(job: PrintJob) {
            mkdirSync(dir, { recursive: true });
            const path = join(dir, `${job.id}.pdf`);
            writeFileSync(path, await job.render());
            logger.info({ job: job.id, path }, 'print written to file');
        },
    };
}
