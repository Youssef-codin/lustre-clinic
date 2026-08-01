import { z } from 'zod';
import { type IsoDate, isoDateSchema } from './time.ts';

/**
 * `GET /api/stats?from=&to=` → `Stats`
 *
 * Inclusive range of clinic-local days. This is the screen you show the doctor
 * to justify the fee, which is exactly why it is not printed (§7) — it is the
 * one part of the system that does not need to survive on paper.
 */
export const statsQuerySchema = z
    .object({
        from: isoDateSchema,
        to: isoDateSchema,
    })
    .refine((r) => r.from <= r.to, { message: '`from` must not be after `to`' });

export type StatsQuery = z.infer<typeof statsQuerySchema>;

export interface Stats {
    /** Echoed back so a slow response cannot be rendered against a newer range. */
    from: IsoDate;
    to: IsoDate;
    /** Appointments *booked* in the range, whatever became of them since. */
    bookings: number;
    cancelled: number;
    noShows: number;
    remindersSent: number;
    /** Delivery failures — the early signal that the number is in trouble (§8). */
    remindersFailed: number;
    /** Patients the system did not reach and someone had to phone. */
    remindersSkipped: number;
}
