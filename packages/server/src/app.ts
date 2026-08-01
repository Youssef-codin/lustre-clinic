import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';
import { requestLogger } from './middleware/logger.ts';
import appointmentRouter from './modules/appointment/appointment.router.ts';
import configRouter from './modules/config/config.router.ts';
import healthRouter from './modules/health/health.router.ts';
import patientRouter from './modules/patient/patient.router.ts';
import printRouter from './modules/print/print.router.ts';
import reminderRouter from './modules/reminder/reminder.router.ts';
import scanRouter from './modules/scan/scan.router.ts';
import slotsRouter from './modules/slots/slots.router.ts';
import whatsappRouter from './modules/whatsapp/whatsapp.router.ts';
import { serveFrontend } from './static.ts';

export function createApp(): Express {
    const app = express();

    app.disable('x-powered-by');
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    // The websocket runs on the same origin, but ws: still needs
                    // naming explicitly, and the LAN install is plain http.
                    connectSrc: ["'self'", 'ws:', 'wss:'],
                    imgSrc: ["'self'", 'data:'],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    /*
                     * Removed, not merely unset — helmet adds it by default.
                     *
                     * The install is plain http on the LAN. With this directive
                     * the browser rewrites every subresource to https, which
                     * nothing here answers, so the page loads and then renders
                     * blank with no console error to explain it.
                     *
                     * It hides during development: `localhost` is a
                     * "potentially trustworthy" origin, so browsers skip the
                     * upgrade there. It only bites over a LAN IP — which is
                     * exactly the phone scanning a printed slip, and nothing
                     * else. Same reasoning as `hsts: false` below.
                     */
                    upgradeInsecureRequests: null,
                },
            },
            // LAN-only over plain http; HSTS would strand the clinic on https.
            hsts: false,
            crossOriginEmbedderPolicy: false,
        }),
    );

    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(requestLogger);

    app.use('/api/health', healthRouter);
    app.use('/api/config', configRouter);
    app.use('/api/appointments', appointmentRouter);
    app.use('/api/slots', slotsRouter);
    app.use('/api/patients', patientRouter);
    app.use('/api/print', printRouter);
    app.use('/api/reminders', reminderRouter);
    app.use('/api/whatsapp', whatsappRouter);

    // Anything else under /api is a 404 in JSON, never the SPA's index.html.
    app.use('/api', notFoundHandler);

    // The QR target. Must be mounted before the frontend, or the SPA catch-all
    // swallows it and a scanned slip silently opens the desk view instead.
    app.use('/s', scanRouter);

    serveFrontend(app);

    app.use(errorHandler);

    return app;
}
