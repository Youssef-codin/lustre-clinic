import { publicProcedure, router } from '../../trpc/init.ts';
import { createProcedureInput, procedureTreeInput, updateProcedureInput } from './procedure.schema.ts';
import { procedureService } from './procedure.service.ts';

export const procedureRouter = router({
    tree: publicProcedure.input(procedureTreeInput).query(({ input }) => procedureService.tree(input)),

    list: publicProcedure.query(() => procedureService.selectableList()),

    create: publicProcedure
        .input(createProcedureInput)
        .mutation(({ input }) => procedureService.create(input)),

    update: publicProcedure
        .input(updateProcedureInput)
        .mutation(({ input }) => procedureService.update(input)),
});
