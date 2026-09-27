import { clinicProcedure, router, setupProcedure } from '../../trpc/init.ts';
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
    tree: clinicProcedure.input(procedureTreeInput).query(({ input }) => procedureService.tree(input)),

    list: clinicProcedure.query(() => procedureService.selectableList()),

    create: setupProcedure
        .input(createProcedureInput)
        .mutation(({ input }) => procedureService.create(input)),

    createCategory: setupProcedure
        .input(createCategoryInput)
        .mutation(({ input }) => procedureService.createCategory(input)),

    update: setupProcedure
        .input(updateProcedureInput)
        .mutation(({ input }) => procedureService.update(input)),

    reorder: setupProcedure
        .input(reorderProceduresInput)
        .mutation(({ input }) => procedureService.reorder(input)),

    /** Work a patient had done before this system knew about it. See `procedure.history.ts`. */
    addHistorical: clinicProcedure
        .input(addHistoricalProceduresInput)
        .mutation(({ input }) => procedureHistoryService.add(input)),

    /** A visit that happened on a day that has passed and was never typed in. */
    addOldVisit: clinicProcedure
        .input(addOldVisitInput)
        .mutation(({ input }) => procedureHistoryService.addOldVisit(input)),
});
