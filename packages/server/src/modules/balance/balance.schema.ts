import { z } from 'zod';

/** SPEC §10. Balances are derived, never stored. */

export const byPatientInput = z.object({ patientId: z.uuid() });

export const balanceSummaryInput = z.object({
    /** Inclusive start, exclusive end — both `YYYY-MM-DD` local dates. */
    from: z.iso.date(),
    to: z.iso.date(),
    offsetMinutes: z.number().int().min(-840).max(840).default(0),
});

export type ByPatientInput = z.infer<typeof byPatientInput>;
export type BalanceSummaryInput = z.infer<typeof balanceSummaryInput>;
