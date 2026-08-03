import { healthRouter } from '../modules/health/health.router.ts';
import { router } from './init.ts';

/**
 * Merges every module router (SPEC §4). This file does nothing else.
 *
 * Modules land here as they are built: settings, branch, procedure, patient,
 * customQuestion, appointment, visit, balance, reminder, stats.
 */
export const appRouter = router({
    health: healthRouter,
});

/**
 * The API contract (§3, §4). Exported as a type only and consumed by the app,
 * which is why request and response types are never hand-written.
 */
export type AppRouter = typeof appRouter;
