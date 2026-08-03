import { publicProcedure, router } from '../../trpc/init.ts';
import { updateSettingsInput } from './settings.schema.ts';
import { settingsService } from './settings.service.ts';

export const settingsRouter = router({
    get: publicProcedure.query(() => settingsService.get()),

    update: publicProcedure.input(updateSettingsInput).mutation(({ input }) => settingsService.update(input)),
});
