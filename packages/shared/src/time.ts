import { z } from 'zod';

/**
 * Two string shapes cross the wire and confusing them puts a booking on the
 * wrong day:
 *
 * - `IsoDate` — `YYYY-MM-DD`, a *clinic-local* calendar day. What a date picker
 *   holds and what every `?date=` query carries.
 * - `IsoInstant` — an absolute UTC moment, `Z`-suffixed. What the db stores and
 *   what `startsAt` always is.
 *
 * Never convert between them by slicing a string: `startsAt.slice(0, 10)` is
 * the UTC day, which is the previous day for anything before 02:00 in Cairo.
 * Go through the clinic timezone from `PublicConfig.clinic.timezone`.
 */

/** `YYYY-MM-DD`, clinic-local. */
export const isoDateSchema = z.iso.date();

/** UTC ISO-8601. Offsets are rejected on purpose — the db holds UTC only. */
export const isoInstantSchema = z.iso.datetime();

export type IsoDate = z.infer<typeof isoDateSchema>;
export type IsoInstant = z.infer<typeof isoInstantSchema>;

/** `?date=YYYY-MM-DD` — shared by the day view, slots, reminders and printing. */
export const dateQuerySchema = z.object({
    date: isoDateSchema,
});

export type DateQuery = z.infer<typeof dateQuerySchema>;

/** `/:id` for any numeric row. Query and param values arrive as strings. */
export const idParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export type IdParam = z.infer<typeof idParamSchema>;
