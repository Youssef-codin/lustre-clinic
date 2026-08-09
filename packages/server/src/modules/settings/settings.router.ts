import { publicProcedure, router } from '../../trpc/init.ts';
import { clearClinicDayInput, setClinicDayInput, updateSettingsInput } from './settings.schema.ts';
import { settingsService } from './settings.service.ts';

export const settingsRouter = router({
    get: publicProcedure.query(() => settingsService.get()),

    update: publicProcedure.input(updateSettingsInput).mutation(({ input }) => settingsService.update(input)),

    /** MAW-1 — the weekly schedule. A weekday with no row is closed. */
    schedule: publicProcedure.query(() => settingsService.schedule()),

    setDay: publicProcedure.input(setClinicDayInput).mutation(({ input }) => settingsService.setDay(input)),

    clearDay: publicProcedure
        .input(clearClinicDayInput)
        .mutation(({ input }) => settingsService.clearDay(input.weekday)),
});
