import { publicProcedure, router } from '../../trpc/init.ts';
import {
    awaitPaymentInput,
    byDateInput,
    byIdInput,
    cancelAppointmentInput,
    createAppointmentInput,
    missedInput,
    updateAppointmentInput,
    walkInInput,
} from './appointment.schema.ts';
import { appointmentService } from './appointment.service.ts';

export const appointmentRouter = router({
    byDate: publicProcedure.input(byDateInput).query(({ input }) => appointmentService.byDate(input)),

    byId: publicProcedure.input(byIdInput).query(({ input }) => appointmentService.byId(input.id)),

    missed: publicProcedure.input(missedInput).query(({ input }) => appointmentService.missed(input)),

    create: publicProcedure
        .input(createAppointmentInput)
        .mutation(({ input }) => appointmentService.create(input)),

    walkIn: publicProcedure.input(walkInInput).mutation(({ input }) => appointmentService.walkIn(input)),

    update: publicProcedure
        .input(updateAppointmentInput)
        .mutation(({ input }) => appointmentService.update(input)),

    cancel: publicProcedure
        .input(cancelAppointmentInput)
        .mutation(({ input }) => appointmentService.cancel(input.id)),

    awaitPayment: publicProcedure
        .input(awaitPaymentInput)
        .mutation(({ input }) => appointmentService.awaitPayment(input.id)),
});
