import type { ApiResponse, ErrorCode, FieldIssue } from '@mawid/shared';

/**
 * Every request is a relative URL. Never `http://localhost:8080` — the same UI
 * loads from a phone on the LAN, where localhost is the phone. See spec §2.
 */

export class ApiError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    readonly issues?: FieldIssue[];

    constructor(status: number, code: ErrorCode, message: string, issues?: FieldIssue[]) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.issues = issues;
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        ...init,
        headers: {
            Accept: 'application/json',
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers,
        },
    });

    let body: ApiResponse<T>;
    try {
        body = (await res.json()) as ApiResponse<T>;
    } catch {
        throw new ApiError(res.status, 'INTERNAL', `${path} returned a non-JSON response`);
    }

    if (!body.success) {
        throw new ApiError(res.status, body.error.code, body.error.message, body.error.issues);
    }

    return body.data;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, data?: unknown) =>
        request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
    patch: <T>(path: string, data: unknown) =>
        request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
