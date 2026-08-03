import { publicProcedure, router } from '../../trpc/init.ts';
import {
    createPatientInput,
    patientByIdInput,
    searchPatientInput,
    updatePatientInput,
} from './patient.schema.ts';
import { patientService } from './patient.service.ts';

export const patientRouter = router({
    search: publicProcedure.input(searchPatientInput).query(({ input }) => patientService.search(input)),

    /** Patient and visit history in one payload (§13). */
    byId: publicProcedure.input(patientByIdInput).query(({ input }) => patientService.byId(input.id)),

    create: publicProcedure.input(createPatientInput).mutation(({ input }) => patientService.create(input)),

    update: publicProcedure.input(updatePatientInput).mutation(({ input }) => patientService.update(input)),
});
