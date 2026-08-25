/**
 * SPEC §10. Balances are derived, never stored. Date ranges are inclusive
 * start, exclusive end — both `YYYY-MM-DD` local dates.
 */
import { z } from 'zod';

export const byPatientInput = z.object({ patientId: z.uuid() });

const offset = z.number().int().min(-840).max(840);

/**
 * A range is two local days, each expanded to an instant by the offset in force
 * *on that day*. One offset for both ends is wrong whenever the range crosses a
 * DST changeover, which "This year" does for half the year in Egypt: applied to
 * 1 January, a summer offset opens the window an hour before local midnight and
 * counts the last hour of 31 December as part of the new year. The queries
 * filter on a timestamp, not on a day bucket, so that hour really does move.
 *
 * `fromOffsetMinutes` is optional and falls back to `offsetMinutes`, which is
 * right for any range that does not span a changeover.
 */
const range = {
    from: z.iso.date(),
    to: z.iso.date(),
    offsetMinutes: offset.default(0),
    fromOffsetMinutes: offset.optional(),
};

export const balanceSummaryInput = z.object(range);

export const balanceTakingsInput = z.object(range);

export type ByPatientInput = z.infer<typeof byPatientInput>;
export type BalanceSummaryInput = z.infer<typeof balanceSummaryInput>;
export type BalanceTakingsInput = z.infer<typeof balanceTakingsInput>;
