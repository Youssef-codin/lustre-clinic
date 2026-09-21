/**
 * Gives a migrated patient back the number on their paper file — the 710/909
 * records written by the old Settings → Data entry flow. The reasoning, and
 * what this will and will not touch, is in
 * `src/modules/migration/repair.ts`; this is the way to run it.
 *
 *   bun db:repair-refs            # report only, nothing written
 *   bun db:repair-refs --apply    # write
 *
 * Patient data never reaches the log (§17): rows are named by id and by ref —
 * the number already written on the file — and never by name or phone.
 */
import { sql } from '../src/db/index.ts';
import { logger } from '../src/logger.ts';
import { repairPatientRefs } from '../src/modules/migration/repair.ts';

const apply = process.argv.includes('--apply');

const MESSAGE: Record<string, string> = {
    repairable: 'giving the patient their old number back',
    taken: 'old number is already another patient ref — left alone',
    reserved: 'old number is at or above the next patient number — raise it in Settings first',
};

try {
    const report = await repairPatientRefs({ apply });

    for (const row of report.rows) {
        const say = row.verdict === 'repairable' ? logger.info : logger.warn;
        say.call(
            logger,
            { patientId: row.patientId, ref: row.ref, oldRef: row.oldRef },
            row.verdict === 'repairable' && !apply
                ? 'would give this patient their old number back'
                : (MESSAGE[row.verdict] ?? row.verdict),
        );
    }

    logger.info(
        {
            repaired: apply ? report.repairable : 0,
            repairable: report.repairable,
            taken: report.taken,
            reserved: report.reserved,
        },
        apply ? 'patient refs repaired' : 'dry run — nothing written; pass --apply to repair',
    );
} catch (err) {
    logger.error({ err }, 'patient ref repair failed');
    process.exitCode = 1;
} finally {
    await sql.end();
}
