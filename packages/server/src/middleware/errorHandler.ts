import { ERROR_CODE } from '@mawid/shared';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.ts';
import { fail, respond } from '../util/apiresponse.ts';
import { logger } from './logger.ts';

export function notFoundHandler(req: Request, res: Response): void {
    respond(res, 404, fail(ERROR_CODE.NOT_FOUND, `No route for ${req.method} ${req.originalUrl}`));
}

/** Central error mapper. Express 5 forwards rejected handler promises here. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(err);
        return;
    }

    if (err instanceof AppError) {
        if (err.status >= 500) logger.error({ code: err.code, err }, 'unhandled app error');
        else logger.warn({ code: err.code, message: err.message }, 'request failed');
        respond(res, err.status, fail(err.code, err.message, err.issues));
        return;
    }

    if (err instanceof SyntaxError && 'body' in err) {
        respond(res, 400, fail(ERROR_CODE.BAD_REQUEST, 'Request body is not valid JSON'));
        return;
    }

    logger.error({ err }, 'unhandled error');
    respond(res, 500, fail(ERROR_CODE.INTERNAL, 'Internal server error'));
}
