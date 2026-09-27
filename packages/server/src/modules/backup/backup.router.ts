import { clinicProcedure, router } from '../../trpc/init.ts';
import { linkDriveInput } from './backup.schema.ts';
import { backupService } from './backup.service.ts';

export const backupRouter = router({
    status: clinicProcedure.query(() => backupService.status()),
    signInConfig: clinicProcedure.query(() => backupService.signInConfig()),
    linkDrive: clinicProcedure.input(linkDriveInput).mutation(({ input }) => backupService.linkDrive(input)),
});
