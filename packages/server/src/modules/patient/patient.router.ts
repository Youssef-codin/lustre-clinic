/**
 * `byId` returns the patient and visit history in one payload (§13).
 */
import { publicProcedure, router } from '../../trpc/init.ts';
import {
    createPatientInput,
    deletePatientInput,
    patientByIdInput,
    patientByPhoneInput,
    patientRefHistoryInput,
    recentPatientsInput,
    searchPatientInput,
    updatePatientInput,
    updatePatientRefInput,
} from './patient.schema.ts';
import { patientService } from './patient.service.ts';

export const patientRouter = router({
    search: publicProcedure.input(searchPatientInput).query(({ input }) => patientService.search(input)),

    recent: publicProcedure.input(recentPatientsInput).query(({ input }) => patientService.recent(input)),

    byId: publicProcedure.input(patientByIdInput).query(({ input }) => patientService.byId(input.id)),

    byPhone: publicProcedure.input(patientByPhoneInput).query(({ input }) => patientService.byPhone(input)),

    create: publicProcedure.input(createPatientInput).mutation(({ input }) => patientService.create(input)),

    update: publicProcedure.input(updatePatientInput).mutation(({ input }) => patientService.update(input)),

    updateRef: publicProcedure
        .input(updatePatientRefInput)
        .mutation(({ input }) => patientService.updateRef(input)),

    refHistory: publicProcedure
        .input(patientRefHistoryInput)
        .query(({ input }) => patientService.refHistory(input.id)),

    delete: publicProcedure
        .input(deletePatientInput)
        .mutation(({ input }) => patientService.delete(input.id)),
});
