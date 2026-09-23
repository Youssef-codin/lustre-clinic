import { publicProcedure, router } from '../../trpc/init.ts';
import { procedureHistoryService } from './procedure.history.ts';
import {
    addHistoricalProceduresInput,
    addOldVisitInput,
    createCategoryInput,
    createProcedureInput,
    procedureTreeInput,
    reorderProceduresInput,
    updateProcedureInput,
} from './procedure.schema.ts';
import { procedureService } from './procedure.service.ts';

export const procedureRouter = router({
    tree: publicProcedure.input(procedureTreeInput).query(({ input }) => procedureService.tree(input)),

    list: publicProcedure.query(() => procedureService.selectableList()),

    create: publicProcedure
        .input(createProcedureInput)
        .mutation(({ input }) => procedureService.create(input)),

    createCategory: publicProcedure
        .input(createCategoryInput)
        .mutation(({ input }) => procedureService.createCategory(input)),

    update: publicProcedure
        .input(updateProcedureInput)
        .mutation(({ input }) => procedureService.update(input)),

    reorder: publicProcedure
        .input(reorderProceduresInput)
        .mutation(({ input }) => procedureService.reorder(input)),

    /** Work a patient had done before this system knew about it. See `procedure.history.ts`. */
    addHistorical: publicProcedure
        .input(addHistoricalProceduresInput)
        .mutation(({ input }) => procedureHistoryService.add(input)),

    /** A visit that happened on a day that has passed and was never typed in. */
    addOldVisit: publicProcedure
        .input(addOldVisitInput)
        .mutation(({ input }) => procedureHistoryService.addOldVisit(input)),
});
