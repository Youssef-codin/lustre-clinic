/**
 * SPEC §13 — `stats.summary({ from, to, branchId })` for the doctor view (§6).
 */
import { z } from 'zod';

export const statsSummaryInput = z.object({
    from: z.iso.date(),
    to: z.iso.date(),
    branchId: z.uuid().optional(),
    offsetMinutes: z.number().int().min(-840).max(840).default(0),
});

export type StatsSummaryInput = z.infer<typeof statsSummaryInput>;
