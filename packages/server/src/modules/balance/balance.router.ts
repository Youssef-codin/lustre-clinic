import { paymentProcedure, router } from '../../trpc/init.ts';
import { balanceSummaryInput, balanceTakingsInput, byPatientInput, settleInput } from './balance.schema.ts';
import { balanceService } from './balance.service.ts';

export const balanceRouter = router({
    outstanding: paymentProcedure.query(() => balanceService.outstanding()),

    byPatient: paymentProcedure
        .input(byPatientInput)
        .query(({ input }) => balanceService.byPatient(input.patientId)),

    /** The app's one payment entry point: money against a patient, not a visit. */
    settle: paymentProcedure.input(settleInput).mutation(({ input }) => balanceService.settle(input)),

    summary: paymentProcedure.input(balanceSummaryInput).query(({ input }) => balanceService.summary(input)),

    takings: paymentProcedure.input(balanceTakingsInput).query(({ input }) => balanceService.takings(input)),
});
