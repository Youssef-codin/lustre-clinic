import { publicProcedure, router } from '../../trpc/init.ts';
import { healthService } from './health.service.ts';

export const healthRouter = router({
    check: publicProcedure.query(() => healthService.check()),
});
