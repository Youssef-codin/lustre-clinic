import { publicProcedure, router } from '../../trpc/init.ts';
import { createBranchInput, listBranchInput, updateBranchInput } from './branch.schema.ts';
import { branchService } from './branch.service.ts';

export const branchRouter = router({
    list: publicProcedure.input(listBranchInput).query(({ input }) => branchService.list(input)),

    create: publicProcedure.input(createBranchInput).mutation(({ input }) => branchService.create(input)),

    update: publicProcedure.input(updateBranchInput).mutation(({ input }) => branchService.update(input)),
});
