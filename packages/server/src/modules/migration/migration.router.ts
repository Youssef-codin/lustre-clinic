/**
 * What is left of the migration module's surface. Registering an old patient is
 * `patient.create` with its `old` block — there is one registration screen and
 * one procedure behind it — so `enter` is gone and this answers only how far
 * the changeover has got.
 */
import { clinicProcedure, router } from '../../trpc/init.ts';
import { migrationService } from './migration.service.ts';

export const migrationRouter = router({
    progress: clinicProcedure.query(({ ctx }) => migrationService.progress(ctx.caller.role)),
});
