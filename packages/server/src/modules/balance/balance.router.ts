import { publicProcedure, router } from '../../trpc/init.ts';
import { balanceSummaryInput, balanceTakingsInput, byPatientInput } from './balance.schema.ts';
import { balanceService } from './balance.service.ts';

export const balanceRouter = router({
    outstanding: publicProcedure.query(() => balanceService.outstanding()),

    byPatient: publicProcedure
        .input(byPatientInput)
        .query(({ input }) => balanceService.byPatient(input.patientId)),

    summary: publicProcedure.input(balanceSummaryInput).query(({ input }) => balanceService.summary(input)),

    takings: publicProcedure.input(balanceTakingsInput).query(({ input }) => balanceService.takings(input)),
});
