import { ERROR_CODE, type ErrorCode, type FieldIssue } from '@mawid/shared';

/**
 * The only error type services throw. `errorHandler` maps it to the response
 * envelope — so a domain failure reaches the frontend as a code, not a string.
 */
export class AppError extends Error {
    readonly status: number;
    readonly code: ErrorCode;
    readonly issues?: FieldIssue[];

    constructor(status: number, code: ErrorCode, message: string, issues?: FieldIssue[]) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
        this.issues = issues;
    }

    static badRequest(message: string, code: ErrorCode = ERROR_CODE.BAD_REQUEST) {
        return new AppError(400, code, message);
    }

    static notFound(message: string, code: ErrorCode = ERROR_CODE.NOT_FOUND) {
        return new AppError(404, code, message);
    }

    static conflict(message: string, code: ErrorCode) {
        return new AppError(409, code, message);
    }

    static internal(message = 'Internal server error') {
        return new AppError(500, ERROR_CODE.INTERNAL, message);
    }
}
