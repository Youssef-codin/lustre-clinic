/**
 * Bulk entry from the old system. `enter` writes the patient and, when they
 * arrived owing something, the synthetic visit that carries it — in one
 * transaction. Duplicate detection is `patient.byPhone`, which the screen calls
 * while the number is being typed.
 */
import { publicProcedure, router } from '../../trpc/init.ts';
import { enterPatientInput } from './migration.schema.ts';
import { migrationService } from './migration.service.ts';

export const migrationRouter = router({
    enter: publicProcedure.input(enterPatientInput).mutation(({ input }) => migrationService.enter(input)),

    progress: publicProcedure.query(() => migrationService.progress()),
});
