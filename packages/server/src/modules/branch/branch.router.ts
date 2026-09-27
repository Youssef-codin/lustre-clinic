import { clinicProcedure, router } from '../../trpc/init.ts';
import { createBranchInput, listBranchInput, updateBranchInput } from './branch.schema.ts';
import { branchService } from './branch.service.ts';

export const branchRouter = router({
    list: clinicProcedure.input(listBranchInput).query(({ input }) => branchService.list(input)),

    create: clinicProcedure.input(createBranchInput).mutation(({ input }) => branchService.create(input)),

    update: clinicProcedure.input(updateBranchInput).mutation(({ input }) => branchService.update(input)),
});
