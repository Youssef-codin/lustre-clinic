/**
 * The response envelope every endpoint uses. The server builds these with
 * `ok()` / `fail()`; the web app narrows on `success` before touching `data`.
 */

export const ERROR_CODE = {
    BAD_REQUEST: 'BAD_REQUEST',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    NOT_FOUND: 'NOT_FOUND',
    INTERNAL: 'INTERNAL',

    // domain failures — the frontend reacts to these, never to a message string
    SLOT_TAKEN: 'SLOT_TAKEN',
    PATIENT_NOT_FOUND: 'PATIENT_NOT_FOUND',
    APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
    OUTSIDE_WORKING_HOURS: 'OUTSIDE_WORKING_HOURS',
    PRINTER_UNAVAILABLE: 'PRINTER_UNAVAILABLE',
    WHATSAPP_DISCONNECTED: 'WHATSAPP_DISCONNECTED',
    WHATSAPP_NO_TEST_NUMBER: 'WHATSAPP_NO_TEST_NUMBER',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export interface FieldIssue {
    path: string;
    message: string;
}

export interface ApiSuccess<T> {
    success: true;
    data: T;
}

export interface ApiFailure {
    success: false;
    error: {
        code: ErrorCode;
        message: string;
        issues?: FieldIssue[];
    };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
