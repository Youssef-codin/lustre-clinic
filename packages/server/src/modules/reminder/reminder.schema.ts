import { z } from 'zod';

/** SPEC §11. Nothing is sent automatically; the user marks each row. */

export const pendingRemindersInput = z
    .object({
        /** Only those already due. False lists every pending row. */
        dueOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(100),
        /**
         * The client's UTC offset in minutes, matching every other date-facing
         * input. The rendered message quotes a date and a time to the patient,
         * so it has to be the clinic's, not UTC's.
         */
        offsetMinutes: z.number().int().min(-840).max(840).default(0),
    })
    .default({ dueOnly: true, limit: 100, offsetMinutes: 0 });

export const reminderIdInput = z.object({ id: z.uuid() });

export const dismissTodayInput = z.object({
    /** The clinic's local date, as the client sees it. */
    date: z.iso.date(),
});

export type PendingRemindersInput = z.infer<typeof pendingRemindersInput>;
export type DismissTodayInput = z.infer<typeof dismissTodayInput>;
