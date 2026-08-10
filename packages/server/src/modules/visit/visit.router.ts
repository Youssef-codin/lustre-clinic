import { publicProcedure, router } from '../../trpc/init.ts';
import {
    checkInInput,
    checkOutInput,
    recordPaymentInput,
    setPriceInput,
    setProceduresInput,
    visitByAppointmentInput,
    visitByIdInput,
} from './visit.schema.ts';
import { visitService } from './visit.service.ts';

export const visitRouter = router({
    byId: publicProcedure.input(visitByIdInput).query(({ input }) => visitService.byId(input.id)),

    /**
     * The visit on an appointment, or null. Returns the full visit rather than
     * the bare row `visitService.byAppointment` selects: every caller wants it
     * in order to check the patient out, and handing back a row would make each
     * of them follow with `byId`.
     */
    byAppointment: publicProcedure.input(visitByAppointmentInput).query(async ({ input }) => {
        const row = await visitService.byAppointment(input.appointmentId);
        return row ? visitService.byId(row.id) : null;
    }),

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
