import { ERROR_CODE, type ErrorCode, isErrorCode } from '@lustre/shared';
import { TRPCClientError } from '@trpc/client';
import { ServerUnreachableError } from './connection';

// Turns anything thrown by a query or mutation into a decision a screen can act
// on (SPEC §4, §14). The client never parses a server message — it switches on
// `appCode` and localizes from that. `offline` means nothing answered (reads
// fall back to cache; writes are shown as failed, never queued); `constraint`
// is an expected refusal, e.g. the Postgres exclusion constraint behind
// `SLOT_OVERLAP` refusing a double booking (§5) — never an incident; `server`
// is anything else worth reporting (§17). A link that never got a response
// leaves no `data`, so a missing HTTP status is offline/timeout, not a server
// error.
export type FailureKind =
    | 'offline'
    | 'timeout'
    | 'server'
    | 'constraint'
    | 'validation'
    | 'notFound'
    | 'unknown';

export interface ApiFailure {
    kind: FailureKind;
    code: ErrorCode;
    httpStatus: number | null;
    retryable: boolean;
    reportable: boolean;
}

const CONSTRAINT_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
    ERROR_CODE.SLOT_OVERLAP,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    ERROR_CODE.INVALID_DURATION,
    ERROR_CODE.REF_GENERATION_FAILED,
    ERROR_CODE.VISIT_ALREADY_EXISTS,
    ERROR_CODE.VISIT_ALREADY_COMPLETED,
    ERROR_CODE.PROCEDURE_NOT_SELECTABLE,
    ERROR_CODE.PROCEDURE_DUPLICATE,
    ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP,
    ERROR_CODE.TOOTH_REQUIRED,
    ERROR_CODE.TOOTH_NOT_APPLICABLE,
    ERROR_CODE.PAYMENT_NOTE_REQUIRED,
    ERROR_CODE.CUSTOM_QUESTION_REQUIRED,
    ERROR_CODE.DUPLICATE_KEY,
]);

const VALIDATION_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
    ERROR_CODE.VALIDATION,
    ERROR_CODE.INVALID_PHONE,
    ERROR_CODE.INVALID_AMOUNT,
]);

interface TrpcErrorData {
    appCode?: unknown;
    httpStatus?: unknown;
}

function dataOf(error: TRPCClientError<never>): TrpcErrorData {
    return (error.data ?? {}) as TrpcErrorData;
}

function offline(): ApiFailure {
    return {
        kind: 'offline',
        code: ERROR_CODE.INTERNAL,
        httpStatus: null,
        retryable: true,
        reportable: false,
    };
}

export function classifyError(error: unknown): ApiFailure {
    if (error instanceof ServerUnreachableError) return offline();

    if (error instanceof TRPCClientError) {
        const data = dataOf(error);
        const httpStatus = typeof data.httpStatus === 'number' ? data.httpStatus : null;

        if (httpStatus === null && !isErrorCode(data.appCode)) {
            const cause = error.cause;
            if (cause instanceof ServerUnreachableError) return offline();
            const aborted = cause instanceof Error && cause.name === 'AbortError';
            return aborted
                ? {
                      kind: 'timeout',
                      code: ERROR_CODE.INTERNAL,
                      httpStatus: null,
                      retryable: true,
                      reportable: false,
                  }
                : offline();
        }

        const code = isErrorCode(data.appCode) ? data.appCode : ERROR_CODE.INTERNAL;

        if (code === ERROR_CODE.NOT_FOUND) {
            return { kind: 'notFound', code, httpStatus, retryable: false, reportable: false };
        }
        if (VALIDATION_CODES.has(code)) {
            return { kind: 'validation', code, httpStatus, retryable: false, reportable: false };
        }
        if (CONSTRAINT_CODES.has(code)) {
            return { kind: 'constraint', code, httpStatus, retryable: false, reportable: false };
        }
        return { kind: 'server', code, httpStatus, retryable: true, reportable: true };
    }

    if (error instanceof Error && error.name === 'AbortError') {
        return {
            kind: 'timeout',
            code: ERROR_CODE.INTERNAL,
            httpStatus: null,
            retryable: true,
            reportable: false,
        };
    }

    return {
        kind: 'unknown',
        code: ERROR_CODE.INTERNAL,
        httpStatus: null,
        retryable: false,
        reportable: true,
    };
}

export function errorCodeOf(error: unknown): ErrorCode {
    return classifyError(error).code;
}

export function isSlotOverlap(error: unknown): boolean {
    return classifyError(error).code === ERROR_CODE.SLOT_OVERLAP;
}

export function isOffline(error: unknown): boolean {
    const kind = classifyError(error).kind;
    return kind === 'offline' || kind === 'timeout';
}
