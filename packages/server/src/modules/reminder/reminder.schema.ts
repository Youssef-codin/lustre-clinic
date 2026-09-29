/**
 * SPEC §11. Nothing is sent automatically; the user marks each row. Dates are
 * the clinic's local ones: `offsetMinutes` is the client's UTC offset, because
 * the rendered message quotes a date and time to the patient.
 *
 * `dueOnly` counts up to `reminderDueCutoff`: what is due by now before the
 * notify time, the rest of the clinic day from it. `throughToday` asks for the
 * rest of the day at any hour, for arming the day's alarm from the morning.
 */
import { z } from 'zod';

export const pendingRemindersInput = z
    .object({
        dueOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(100),
        offsetMinutes: z.number().int().min(-840).max(840).default(0),
        throughToday: z.boolean().optional(),
    })
    .default({ dueOnly: true, limit: 100, offsetMinutes: 0 });

export const reminderIdInput = z.object({ id: z.uuid() });

export const dismissTodayInput = z.object({
    date: z.iso.date(),
});

export type PendingRemindersInput = z.infer<typeof pendingRemindersInput>;
export type DismissTodayInput = z.infer<typeof dismissTodayInput>;
