import { MAX_AMOUNT_PIASTRES, paymentMethodSchema, toothSchema } from '@mawid/shared';
import { z } from 'zod';

/** SPEC §8, §9, §13. Amounts are integer piastres. */

const amount = z.number().int().min(0).max(MAX_AMOUNT_PIASTRES);

export const checkInInput = z.object({ appointmentId: z.uuid() });

export const visitByIdInput = z.object({ id: z.uuid() });

/** Replaces the whole list; it does not patch individual lines (§13). */
export const setProceduresInput = z.object({
    visitId: z.uuid(),
    procedures: z
        .array(
            z.object({
                procedureId: z.uuid(),
                quantity: z.number().int().min(1).max(999).default(1),
                /** Overrides the snapshot; defaults to the procedure's price. */
                unitPrice: amount.optional(),
                /** Palmer notation. Omitted when the procedure is not tooth-specific (§5). */
                tooth: toothSchema.nullish(),
                note: z.string().trim().max(500).nullish(),
            }),
        )
        .max(100),
});

export const setPriceInput = z.object({
    visitId: z.uuid(),
    chargedTotal: amount,
});

const payment = {
    method: paymentMethodSchema,
    methodNote: z.string().trim().max(200).nullish(),
};

export const checkOutInput = z
    .object({
        visitId: z.uuid(),
        chargedTotal: amount,
        /** May be zero, partial, or full (§8). */
        paidTotal: amount.default(0),
        ...payment,
    })
    .refine((v) => v.paidTotal === 0 || v.method !== 'other' || !!v.methodNote?.trim(), {
        message: "method 'other' requires methodNote",
        path: ['methodNote'],
    });

export const recordPaymentInput = z
    .object({
        visitId: z.uuid(),
        amount: amount.refine((n) => n > 0, 'a payment must be positive'),
        ...payment,
    })
    .refine((v) => v.method !== 'other' || !!v.methodNote?.trim(), {
        message: "method 'other' requires methodNote",
        path: ['methodNote'],
    });

export type CheckInInput = z.infer<typeof checkInInput>;
export type SetProceduresInput = z.infer<typeof setProceduresInput>;
export type SetPriceInput = z.infer<typeof setPriceInput>;
export type CheckOutInput = z.infer<typeof checkOutInput>;
export type RecordPaymentInput = z.infer<typeof recordPaymentInput>;
