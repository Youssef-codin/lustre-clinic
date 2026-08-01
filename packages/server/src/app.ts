import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';
import { requestLogger } from './middleware/logger.ts';
import appointmentRouter from './modules/appointment/appointment.router.ts';
import configRouter from './modules/config/config.router.ts';
import healthRouter from './modules/health/health.router.ts';
import patientRouter from './modules/patient/patient.router.ts';
import slotsRouter from './modules/slots/slots.router.ts';
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

    // Anything else under /api is a 404 in JSON, never the SPA's index.html.
    app.use('/api', notFoundHandler);

    serveFrontend(app);

    app.use(errorHandler);

    return app;
}
