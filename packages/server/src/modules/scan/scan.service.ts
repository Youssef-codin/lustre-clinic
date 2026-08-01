import { ERROR_CODE } from '@mawid/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/index.ts';
import { AppError } from '../../errors/AppError.ts';
import { logger } from '../../middleware/logger.ts';
import { broadcast } from '../../ws/index.ts';

export interface ScanResult {
    appointmentId: number;
    patientId: number;
}

/**
 * Resolves a scanned ref, announces it, and hands back who it belongs to.
 *
 * The announcement is the point: scanning a printed slip with a phone makes the
 * desk screen jump to that patient, which turns paper into a remote control for
 * the system (spec §9). The phone gets a redirect; every other connected screen
 * gets a `scan` event.
 *
 * A cancelled appointment still resolves. The slip is in someone's hand and the
 * patient record is what they are looking for — the page shows the status.
 */
export function recordScan(ref: string): ScanResult {
    const row = getDb()
        .select({ id: schema.appointments.id, patientId: schema.appointments.patientId })
        .from(schema.appointments)
        .where(eq(schema.appointments.ref, ref))
        .get();

    if (!row) {
        throw AppError.notFound(`No appointment with ref ${ref}`, ERROR_CODE.APPOINTMENT_NOT_FOUND);
    }

    const result: ScanResult = { appointmentId: row.id, patientId: row.patientId };

    // IDs only — never the patient's name or phone. See spec §3.
    logger.info(result, 'slip scanned');
    broadcast('scan', result);

    return result;
}
