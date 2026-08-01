import { logger } from '../../../middleware/logger.ts';
import type { PrintDriver, PrintJob } from '../driver.ts';

/** Printing turned off. Renders nothing; logs that it would have. */
export function noneDriver(): PrintDriver {
    return {
        name: 'none',
        async available() {
            return true;
        },
        async print(job: PrintJob) {
            logger.info({ job: job.id, kind: job.target.kind }, 'printing disabled — job skipped');
        },
    };
}
