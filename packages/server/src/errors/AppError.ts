import { ERROR_CODE, type ErrorCode } from '@mawid/shared';

/**
 * SPEC §4. Services throw `AppError`; the tRPC `errorFormatter` maps it onto a
 * `TRPCError` and carries `code` through as `shape.data.appCode`.
 *
 * `message` stays English — it is for logs. The client localizes from `code`
 * and never parses the message.
 */
export class AppError extends Error {
    readonly code: ErrorCode;
    readonly httpStatus: number;

    constructor(code: ErrorCode, message: string, httpStatus = 400, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'AppError';
        this.code = code;
        this.httpStatus = httpStatus;
    }

    static notFound(what: string): AppError {
        return new AppError(ERROR_CODE.NOT_FOUND, `${what} not found`, 404);
    }

    static internal(message = 'Internal error', options?: { cause?: unknown }): AppError {
        return new AppError(ERROR_CODE.INTERNAL, message, 500, options);
    }
}

export function isAppError(err: unknown): err is AppError {
    return err instanceof AppError;
}

/** Postgres SQLSTATE codes the services care about. */
export const PG_ERROR = {
    UNIQUE_VIOLATION: '23505',
    EXCLUSION_VIOLATION: '23P01',
    CHECK_VIOLATION: '23514',
    FOREIGN_KEY_VIOLATION: '23503',
} as const;

/**
 * The SQLSTATE, wherever it is. Drizzle wraps driver errors in a
 * `DrizzleQueryError` and hangs the original off `cause`, so the code services
 * switch on is usually a level or two down.
 */
export function pgErrorCode(err: unknown): string | undefined {
    let current: unknown = err;

    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
        if ('code' in current && typeof current.code === 'string') return current.code;
        current = (current as { cause?: unknown }).cause;
    }
    return undefined;
}
