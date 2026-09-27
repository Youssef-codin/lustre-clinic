import { clinicProcedure, router } from '../../trpc/init.ts';
import {
    awaitPaymentInput,
    byDateInput,
    byIdInput,
    cancelAppointmentInput,
    createAppointmentInput,
    markLabReadyInput,
    missedInput,
    updateAppointmentInput,
    walkInInput,
} from './appointment.schema.ts';
import { appointmentService } from './appointment.service.ts';

export const appointmentRouter = router({
    byDate: clinicProcedure.input(byDateInput).query(({ input }) => appointmentService.byDate(input)),

    byId: clinicProcedure.input(byIdInput).query(({ input }) => appointmentService.byId(input.id)),

    missed: clinicProcedure.input(missedInput).query(({ input }) => appointmentService.missed(input)),

    create: clinicProcedure
        .input(createAppointmentInput)
        .mutation(({ input }) => appointmentService.create(input)),

    walkIn: clinicProcedure.input(walkInInput).mutation(({ input }) => appointmentService.walkIn(input)),

    update: clinicProcedure
        .input(updateAppointmentInput)
        .mutation(({ input }) => appointmentService.update(input)),

    markLabReady: clinicProcedure
        .input(markLabReadyInput)
        .mutation(({ input }) => appointmentService.markLabReady(input.id)),

    cancel: clinicProcedure
        .input(cancelAppointmentInput)
        .mutation(({ input }) => appointmentService.cancel(input.id)),

    awaitPayment: clinicProcedure
        .input(awaitPaymentInput)
        .mutation(({ input }) => appointmentService.awaitPayment(input.id, input.offsetMinutes)),
});
