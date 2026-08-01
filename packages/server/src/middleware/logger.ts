import type { NextFunction, Request, Response } from 'express';
import { pino } from 'pino';
import pretty from 'pino-pretty';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * pino-pretty is attached as a stream rather than a transport — transports run
 * in a worker thread, which does not survive `bun build --compile`.
 *
 * Never log patient names, phone numbers or notes. IDs only. Logs get copied
 * around during debugging and this is medical data. See spec §3.
 */
export const logger = isDev
    ? pino({ level: process.env.LOG_LEVEL ?? 'debug' }, pretty({ colorize: true, translateTime: 'HH:MM:ss' }))
    : pino({ level: process.env.LOG_LEVEL ?? 'info' });

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const startedAt = performance.now();

    res.on('finish', () => {
        const ms = Math.round(performance.now() - startedAt);
        // originalUrl, not path — inside a mounted router `path` is only the sub-path.
        const line = { method: req.method, path: req.originalUrl, status: res.statusCode, ms };
        if (res.statusCode >= 500) logger.error(line, 'request failed');
        else if (res.statusCode >= 400) logger.warn(line, 'request rejected');
        else logger.debug(line, 'request');
    });

    next();
}
