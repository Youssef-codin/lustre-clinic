import { publicProcedure, router } from '../../trpc/init.ts';
import {
    checkInInput,
    checkOutInput,
    recordPaymentInput,
    setPriceInput,
    setProceduresInput,
    visitByIdInput,
} from './visit.schema.ts';
import { visitService } from './visit.service.ts';

export const visitRouter = router({
    byId: publicProcedure.input(visitByIdInput).query(({ input }) => visitService.byId(input.id)),

    checkIn: publicProcedure.input(checkInInput).mutation(({ input }) => visitService.checkIn(input)),

    setProcedures: publicProcedure
        .input(setProceduresInput)
        .mutation(({ input }) => visitService.setProcedures(input)),

    setPrice: publicProcedure.input(setPriceInput).mutation(({ input }) => visitService.setPrice(input)),

    checkOut: publicProcedure.input(checkOutInput).mutation(({ input }) => visitService.checkOut(input)),

    recordPayment: publicProcedure
        .input(recordPaymentInput)
        .mutation(({ input }) => visitService.recordPayment(input)),
});
