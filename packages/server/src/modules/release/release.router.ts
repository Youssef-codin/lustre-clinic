import { publicProcedure, router } from '../../trpc/init.ts';
import { releaseService } from './release.service.ts';

export const releaseRouter = router({
    latestApk: publicProcedure.query(() => releaseService.latestApk()),
});
