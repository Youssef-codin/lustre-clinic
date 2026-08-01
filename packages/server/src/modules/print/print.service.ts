import { ERROR_CODE, type IsoDate, type PrintFailuresResponse, type PrintQueued } from '@mawid/shared';
import { AppError } from '../../errors/AppError.ts';
import { printDaySchedule, printSlip, recentFailures } from '../../services/printer/index.ts';
import { getStatus } from '../../services/status.ts';
import { getAppointment, listDay } from '../appointment/appointment.service.ts';

/**
 * These are the reprint path. Nothing about a print job is stored — everything
 * printable is derivable from the appointment, so a reprint is just another
 * render (spec §7). That is why both endpoints take a subject rather than a job
 * id: there is no job to look up.
 */

/**
 * A printer that reported itself unavailable at boot, or one the clinic turned
 * off, is told to the caller rather than swallowed. Queueing into a driver that
 * cannot print would return "queued" for paper that is never going to appear —
 * the silent failure spec §7 is built to avoid.
 *
 * `degraded` still queues: that only means an earlier job failed, and the next
 * one may well succeed.
 */
function assertPrinterUsable(): void {
    const { printer } = getStatus();

    if (printer === 'down' || printer === 'disabled') {
        throw new AppError(
            503,
            ERROR_CODE.PRINTER_UNAVAILABLE,
            printer === 'disabled'
                ? 'Printing is turned off in this clinic’s configuration'
                : 'The printer is not available',
        );
    }
}

export function queueSlip(appointmentId: number): PrintQueued {
    assertPrinterUsable();

    // Throws APPOINTMENT_NOT_FOUND, so a reprint of something deleted is a 404
    // rather than a job that fails later with nothing to point at.
    const appointment = getAppointment(appointmentId);
    printSlip(appointment);

    return { queued: true, kind: 'slip' };
}

/** A day with nothing booked still prints — a blank sheet is a valid answer. */
export function queueDaySchedule(date: IsoDate): PrintQueued {
    assertPrinterUsable();
    printDaySchedule(date, listDay(date));

    return { queued: true, kind: 'day' };
}

export function listPrintFailures(): PrintFailuresResponse {
    return [...recentFailures()];
}
