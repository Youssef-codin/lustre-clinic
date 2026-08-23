/**
 * `AppRouter` is the API contract (§3, §4). Exported as a type only and
 * consumed by the app, which is why request and response types are never
 * hand-written.
 */
import { appointmentRouter } from '../modules/appointment/appointment.router.ts';
import { balanceRouter } from '../modules/balance/balance.router.ts';
import { branchRouter } from '../modules/branch/branch.router.ts';
import { customQuestionRouter } from '../modules/customQuestion/customQuestion.router.ts';
import { healthRouter } from '../modules/health/health.router.ts';
import { migrationRouter } from '../modules/migration/migration.router.ts';
import { patientRouter } from '../modules/patient/patient.router.ts';
import { procedureRouter } from '../modules/procedure/procedure.router.ts';
import { reminderRouter } from '../modules/reminder/reminder.router.ts';
import { settingsRouter } from '../modules/settings/settings.router.ts';
import { statsRouter } from '../modules/stats/stats.router.ts';
import { visitRouter } from '../modules/visit/visit.router.ts';
import { router } from './init.ts';

export const appRouter = router({
    health: healthRouter,
    settings: settingsRouter,
    branch: branchRouter,
    procedure: procedureRouter,
    patient: patientRouter,
    customQuestion: customQuestionRouter,
    appointment: appointmentRouter,
    visit: visitRouter,
    balance: balanceRouter,
    reminder: reminderRouter,
    stats: statsRouter,
    migration: migrationRouter,
});

export type AppRouter = typeof appRouter;
