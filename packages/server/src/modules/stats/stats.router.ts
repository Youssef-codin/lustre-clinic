import { publicProcedure, router } from '../../trpc/init.ts';
import { statsSummaryInput } from './stats.schema.ts';
import { statsService } from './stats.service.ts';

export const statsRouter = router({
    summary: publicProcedure.input(statsSummaryInput).query(({ input }) => statsService.summary(input)),
});
