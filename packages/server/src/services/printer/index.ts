import type { AppointmentWithPatient, IsoDate } from '@mawid/shared';
import type { Config } from '../../config/index.ts';
import { logger } from '../../middleware/logger.ts';
import { setStatus } from '../status.ts';
import type { PrintDriver } from './driver.ts';
import { fileDriver } from './drivers/file.driver.ts';
import { noneDriver } from './drivers/none.driver.ts';
import { pdfDriver } from './drivers/pdf.driver.ts';
import { enqueue, type QueueOptions, setDriver } from './queue.ts';
import { renderDaySchedule } from './render/day.ts';
import { renderSlip } from './render/slip.ts';

export { clearFailures, flush, recentFailures } from './queue.ts';

let current: Config | null = null;

function driverFor(config: Config): PrintDriver {
    switch (config.printing.driver) {
        case 'pdf':
            return pdfDriver(config);
        case 'file':
            return fileDriver(config);
        case 'none':
            return noneDriver();
        case 'escpos':
            // Deferred (spec §14). Falling back keeps a misconfigured install
            // printing to a folder rather than silently printing nothing.
            logger.warn('escpos driver is not built — falling back to the file driver');
            return fileDriver(config);
    }
}

/**
 * Started from `server.ts` after migrations. `queue` carries the retry policy —
 * a service knob, not just a test seam: a slow spooler wants different backoff
 * from a network printer. Checks the driver once at boot so
 * a missing SumatraPDF or an unwritable output folder is visible on
 * `/api/health` before anyone tries to book.
 */
export async function startPrinter(config: Config, queue: QueueOptions = {}): Promise<void> {
    current = config;

    const driver = driverFor(config);
    setDriver(driver, queue);

    if (config.printing.driver === 'none') {
        setStatus('printer', 'disabled');
        logger.info('printing is disabled by config');
        return;
    }

    const ok = await driver.available();
    setStatus('printer', ok ? 'ok' : 'down');
    logger.info({ driver: driver.name, available: ok }, 'printer ready');
}

function config(): Config {
    if (!current) throw new Error('Printer service used before startPrinter() ran');
    return current;
}

/** Queued, never awaited by a request — see `enqueue`. */
export function printSlip(appointment: AppointmentWithPatient): void {
    enqueue({
        id: `slip-${appointment.ref}`,
        target: { kind: 'slip', appointmentId: appointment.id },
        render: () => renderSlip(appointment, config()),
    });
}

export function printDaySchedule(date: IsoDate, appointments: AppointmentWithPatient[]): void {
    enqueue({
        id: `day-${date}`,
        target: { kind: 'day', date },
        render: () => renderDaySchedule(date, appointments, config()),
    });
}

export { renderDaySchedule, renderSlip };
