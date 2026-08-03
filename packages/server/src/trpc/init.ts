import { ERROR_CODE, type ErrorCode } from '@mawid/shared';
import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { db } from '../db/index.ts';
import { AppError, isAppError } from '../errors/AppError.ts';
import { logger } from '../logger.ts';
import { alert } from '../monitoring/index.ts';

/**
 * SPEC §4. The context is minimal: `{ db }`. There is no auth (§1), so there is
 * no session and no user on it.
 */
export function createContext() {
    return { db };
}

export type Context = ReturnType<typeof createContext>;

/** Nearest tRPC code for an `AppError.httpStatus`, which sets the HTTP status. */
function trpcCodeFor(httpStatus: number): TRPCError['code'] {
    switch (httpStatus) {
        case 404:
            return 'NOT_FOUND';
        case 409:
            return 'CONFLICT';
        case 422:
            return 'UNPROCESSABLE_CONTENT';
        case 500:
            return 'INTERNAL_SERVER_ERROR';
        default:
            return 'BAD_REQUEST';
    }
}

const t = initTRPC.context<Context>().create({
    /**
     * Carries the app code through as `shape.data.appCode`. The client switches
     * on it and localizes from it; it never parses `message` (§4).
     */
    errorFormatter({ shape, error }) {
        const cause = error.cause;

        let appCode: ErrorCode = ERROR_CODE.INTERNAL;

        if (isAppError(cause)) {
            appCode = cause.code;
        } else if (cause instanceof ZodError || error.code === 'BAD_REQUEST') {
            appCode = ERROR_CODE.VALIDATION;
        } else if (error.code === 'NOT_FOUND') {
            appCode = ERROR_CODE.NOT_FOUND;
        }

        return {
            ...shape,
            data: {
                ...shape.data,
                appCode,
            },
        };
    },
});

/**
 * Services throw `AppError` and never import tRPC (§4). This is the one place
 * that translates. Anything else that escapes a procedure is unexpected, so it
 * is logged with its stack and reported to the client as INTERNAL.
 */
const errorMapper = t.middleware(async ({ next, path }) => {
    const result = await next();
    if (result.ok) return result;

    const cause = result.error.cause;

    if (isAppError(cause)) {
        // Expected domain failure. IDs and codes only — never patient data.
        logger.warn({ appCode: cause.code, path }, 'procedure failed');
        throw new TRPCError({
            code: trpcCodeFor(cause.httpStatus),
            message: cause.message,
            cause,
        });
    }

    if (cause instanceof ZodError || result.error.code === 'BAD_REQUEST') {
        logger.warn({ appCode: ERROR_CODE.VALIDATION, path }, 'invalid input');
        return result;
    }

    logger.error({ err: result.error, path }, 'unhandled procedure error');
    // §17: unexpected failures are reported. Path and error name only.
    void alert({
        code: 'trpc.unhandled_error',
        summary: 'A procedure failed with an unexpected error.',
        context: { path: path ?? null, error: cause instanceof Error ? cause.name : typeof cause },
    });
    throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal error',
        cause: AppError.internal('Internal error', { cause: result.error }),
    });
});

export const router = t.router;
export const middleware = t.middleware;

/**
 * There is exactly one procedure kind. Access is controlled by reachability on
 * the tailnet (§1), so there is nothing for a protected procedure to check.
 */
export const publicProcedure = t.procedure.use(errorMapper);
