import { z } from 'zod';
import { dateQuerySchema, type IsoDate, type IsoInstant } from './time.ts';

/**
 * Print jobs are not persisted — everything printable is derivable from the
 * appointment, so "reprint" means render it again. What *is* kept is the last
 * few failures, in memory, because a silent failure to print is the worst
 * outcome in this system: the paper the clinic runs on never appears and nobody
 * finds out. See spec §7.
 */

export const PRINT_JOB_KINDS = ['slip', 'day'] as const;
export const printJobKindSchema = z.enum(PRINT_JOB_KINDS);
export type PrintJobKind = (typeof PRINT_JOB_KINDS)[number];

/**
 * What failed, in the form the reprint button needs: each variant maps onto
 * exactly one endpoint — `POST /api/print/slip/:appointmentId` and
 * `POST /api/print/day?date=`. The banner can retry without knowing anything
 * else about the job.
 */
export type PrintJobTarget = { kind: 'slip'; appointmentId: number } | { kind: 'day'; date: IsoDate };

/**
 * One entry in the desk banner. Arrives two ways and must look identical in
 * both: pushed live on `print:failed`, and fetched from
 * `GET /api/print/failures` when a screen loads or the socket reconnects —
 * otherwise a failure that happened while the desk was reloading is invisible.
 */
export type PrintFailure = PrintJobTarget & {
    /** In-memory id, stable for the life of the process. Dedupes the live event
     *  against the fetched list, and lets the desk dismiss one row. */
    id: string;
    /** Driver-level text, e.g. `SumatraPDF exited 2`. Never patient data — this
     *  string reaches logs and, later, alerts (§10). */
    error: string;
    /** Which driver was in use, so the banner can say what to go and check. */
    driver: string;
    /** Attempts made before the queue gave up. */
    attempts: number;
    failedAt: IsoInstant;
};

/** `GET /api/print/failures` → recent failures, newest first. Bounded, in-memory. */
export type PrintFailuresResponse = PrintFailure[];

/** `POST /api/print/slip/:appointmentId` → `PrintQueued` */
export const printSlipParamSchema = z.object({
    appointmentId: z.coerce.number().int().positive(),
});

/** `POST /api/print/day?date=` → `PrintQueued` */
export const printDayQuerySchema = dateQuerySchema;

/**
 * Printing is queued, not awaited — the secretary must not wait on a spooler to
 * finish booking. Success here means accepted; an actual failure arrives later
 * on `print:failed`.
 */
export interface PrintQueued {
    queued: true;
    kind: PrintJobKind;
}
