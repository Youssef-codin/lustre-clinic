import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import { logger } from './middleware/logger.ts';
import { appRoot } from './util/paths.ts';

/**
 * The built frontend is shipped as a `public/` folder beside the executable and
 * resolved relative to it, because `__dirname` is meaningless inside a compiled
 * binary — see spec §2. In dev that same path is `packages/server/public`,
 * which is exactly where `packages/web` builds to.
 */
export const publicDir = join(appRoot, 'public');

export function serveFrontend(app: Express): void {
    if (!existsSync(publicDir)) {
        logger.warn({ publicDir }, 'no built frontend found — run `bun run build` in packages/web');
    }

    app.use(express.static(publicDir, { index: false, maxAge: '1h' }));

    // Everything that is not /api and not a real file is the SPA: the desk view,
    // /p/:patientId on a phone, and any client route added later.
    app.use((req: Request, res: Response, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        const index = join(publicDir, 'index.html');
        if (!existsSync(index)) {
            res.status(503)
                .type('text/plain')
                .send('Frontend not built. Run `bun run build` in packages/web.');
            return;
        }

        res.sendFile(index);
    });
}
