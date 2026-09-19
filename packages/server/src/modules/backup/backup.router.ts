import { publicProcedure, router } from '../../trpc/init.ts';
import { backupService } from './backup.service.ts';

export const backupRouter = router({
    status: publicProcedure.query(() => backupService.status()),
});
