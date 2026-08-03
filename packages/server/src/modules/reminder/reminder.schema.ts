import { z } from 'zod';

/** SPEC §11. Nothing is sent automatically; the user marks each row. */

export const pendingRemindersInput = z
    .object({
        /** Only those already due. False lists every pending row. */
        dueOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(100),
    })
    .default({ dueOnly: true, limit: 100 });

export const reminderIdInput = z.object({ id: z.uuid() });

export const dismissTodayInput = z.object({
    /** The clinic's local date, as the client sees it. */
    date: z.iso.date(),
});

export type PendingRemindersInput = z.infer<typeof pendingRemindersInput>;
export type DismissTodayInput = z.infer<typeof dismissTodayInput>;
