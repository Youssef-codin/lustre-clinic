/**
 * Bulk entry from the old system. The patient half is `createPatientInput`
 * without `custom`: the questionnaire is answered at the desk when the patient
 * next comes in, not typed off a list, so nothing here requires it.
 *
 * `openingBalance` is piastres like every other amount, and drags `branchId`
 * and `cutoffDate` in with it — a synthetic appointment needs a branch and a
 * date, and there is no sensible default for either. The `refine` is what makes
 * the three arrive together or not at all.
 */
import { MAX_AMOUNT_PIASTRES } from '@lustre/shared';
import { z } from 'zod';
import { createPatientInput } from '../patient/patient.schema.ts';

export const enterPatientInput = createPatientInput
    .omit({ custom: true })
    .extend({
        /** What the patient owed at the cutoff. Zero is not a balance, it is the absence of one. */
        openingBalance: z.number().int().positive().max(MAX_AMOUNT_PIASTRES).optional(),
        branchId: z.uuid().optional(),
        cutoffDate: z.iso.date().optional(),
        offsetMinutes: z.number().int().min(-840).max(840).default(0),
    })
    .refine(
        (v) => v.openingBalance === undefined || (v.branchId !== undefined && v.cutoffDate !== undefined),
        {
            message: 'an opening balance needs a branch and a cutoff date',
            path: ['openingBalance'],
        },
    );

export type EnterPatientInput = z.infer<typeof enterPatientInput>;
