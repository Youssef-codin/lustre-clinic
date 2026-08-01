import type { ApiFailure, ApiSuccess, ErrorCode, FieldIssue } from '@mawid/shared';
import type { Response } from 'express';

export function ok<T>(data: T): ApiSuccess<T> {
    return { success: true, data };
}

export function fail(code: ErrorCode, message: string, issues?: FieldIssue[]): ApiFailure {
    return { success: false, error: issues ? { code, message, issues } : { code, message } };
}

export function respond<T>(res: Response, status: number, body: ApiSuccess<T> | ApiFailure): Response {
    return res.status(status).json(body);
}
