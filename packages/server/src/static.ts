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

    /*
     * Every emitted asset filename carries a content hash (see `naming` in
     * packages/web/build.ts), so changed content is always a changed URL and
     * these can be cached hard. `immutable` also stops the revalidation request
     * a phone would otherwise make on every scan.
     *
     * This is only safe because `index.html` below is never cached. If that
     * changes, this must change with it.
     */
    app.use(express.static(publicDir, { index: false, maxAge: '1y', immutable: true }));

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

        /*
         * Never cached. This file names the hashed asset URLs, so a stale copy
         * points at files the last build deleted — which renders as a blank
         * page with nothing in the console to explain it.
         *
         * `no-cache` permits a conditional request rather than forbidding
         * storage, so the usual answer is a 304 costing one round trip, not a
         * re-download. `cacheControl: false` stops `sendFile` writing its own
         * `public, max-age=0` over the top of this.
         */
        res.sendFile(index, {
            cacheControl: false,
            headers: { 'Cache-Control': 'no-cache' },
        });
    });
}
