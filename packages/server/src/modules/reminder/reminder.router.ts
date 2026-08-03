import { publicProcedure, router } from '../../trpc/init.ts';
import { dismissTodayInput, pendingRemindersInput, reminderIdInput } from './reminder.schema.ts';
import { reminderService } from './reminder.service.ts';

export const reminderRouter = router({
    pending: publicProcedure
        .input(pendingRemindersInput)
        .query(({ input }) => reminderService.pending(input)),

    markSent: publicProcedure
        .input(reminderIdInput)
        .mutation(({ input }) => reminderService.markSent(input.id)),

    markSkipped: publicProcedure
        .input(reminderIdInput)
        .mutation(({ input }) => reminderService.markSkipped(input.id)),

    dismissToday: publicProcedure
        .input(dismissTodayInput)
        .mutation(({ input }) => reminderService.dismissToday(input)),
});
