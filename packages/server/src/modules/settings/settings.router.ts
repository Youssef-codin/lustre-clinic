/**
 * `schedule` is the weekly schedule (MAW-1); a weekday with no row is closed.
 */
import { clinicProcedure, router } from '../../trpc/init.ts';
import { clearClinicDayInput, setClinicDayInput, updateSettingsInput } from './settings.schema.ts';
import { settingsService } from './settings.service.ts';

export const settingsRouter = router({
    get: clinicProcedure.query(() => settingsService.get()),

    update: clinicProcedure.input(updateSettingsInput).mutation(({ input }) => settingsService.update(input)),

    schedule: clinicProcedure.query(() => settingsService.schedule()),

    setDay: clinicProcedure.input(setClinicDayInput).mutation(({ input }) => settingsService.setDay(input)),

    clearDay: clinicProcedure
        .input(clearClinicDayInput)
        .mutation(({ input }) => settingsService.clearDay(input.weekday)),
});
