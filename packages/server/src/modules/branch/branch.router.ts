import { clinicProcedure, router, setupProcedure } from '../../trpc/init.ts';
import { createBranchInput, listBranchInput, updateBranchInput } from './branch.schema.ts';
import { branchService } from './branch.service.ts';

export const branchRouter = router({
    list: clinicProcedure.input(listBranchInput).query(({ input }) => branchService.list(input)),

    create: setupProcedure.input(createBranchInput).mutation(({ input }) => branchService.create(input)),

    update: setupProcedure.input(updateBranchInput).mutation(({ input }) => branchService.update(input)),
});
