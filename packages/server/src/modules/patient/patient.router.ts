/**
 * `byId` returns the patient and visit history in one payload (§13).
 */
import { publicProcedure, router } from '../../trpc/init.ts';
import {
    createPatientInput,
    patientByIdInput,
    patientByPhoneInput,
    recentPatientsInput,
    searchPatientInput,
    updatePatientInput,
} from './patient.schema.ts';
import { patientService } from './patient.service.ts';

export const patientRouter = router({
    search: publicProcedure.input(searchPatientInput).query(({ input }) => patientService.search(input)),

    recent: publicProcedure.input(recentPatientsInput).query(({ input }) => patientService.recent(input)),

    byId: publicProcedure.input(patientByIdInput).query(({ input }) => patientService.byId(input.id)),

    byPhone: publicProcedure.input(patientByPhoneInput).query(({ input }) => patientService.byPhone(input)),

    create: publicProcedure.input(createPatientInput).mutation(({ input }) => patientService.create(input)),

    update: publicProcedure.input(updatePatientInput).mutation(({ input }) => patientService.update(input)),
});
