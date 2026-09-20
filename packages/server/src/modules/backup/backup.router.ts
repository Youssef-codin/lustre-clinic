import { publicProcedure, router } from '../../trpc/init.ts';
import { linkDriveInput } from './backup.schema.ts';
import { backupService } from './backup.service.ts';

export const backupRouter = router({
    status: publicProcedure.query(() => backupService.status()),
    signInConfig: publicProcedure.query(() => backupService.signInConfig()),
    linkDrive: publicProcedure.input(linkDriveInput).mutation(({ input }) => backupService.linkDrive(input)),
});
