import { createRouter } from '@tanstack/react-router';
import { deskRoute } from './routes/desk.tsx';
import { patientRoute } from './routes/patient.tsx';
import { rootRoute } from './routes/root.tsx';

/**
 * Routes are declared in code rather than generated from the filesystem: this
 * package is bundled by `bun build` (see build.ts) and the file-based plugin
 * targets other bundlers. Three routes do not justify changing the build.
 */
const routeTree = rootRoute.addChildren([deskRoute, patientRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
