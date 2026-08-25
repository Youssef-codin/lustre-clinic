/**
 * SPEC §10. Balances are derived, never stored. Date ranges are inclusive
 * start, exclusive end — both `YYYY-MM-DD` local dates.
 */
import { z } from 'zod';

export const byPatientInput = z.object({ patientId: z.uuid() });

const range = {
    from: z.iso.date(),
    to: z.iso.date(),
    offsetMinutes: z.number().int().min(-840).max(840).default(0),
};

export const balanceSummaryInput = z.object(range);

export const balanceTakingsInput = z.object(range);

export type ByPatientInput = z.infer<typeof byPatientInput>;
export type BalanceSummaryInput = z.infer<typeof balanceSummaryInput>;
export type BalanceTakingsInput = z.infer<typeof balanceTakingsInput>;
