import { ERROR_CODE, type ErrorCode, isErrorCode } from '@mawid/shared';
import { TRPCClientError } from '@trpc/client';
import { ServerUnreachableError } from './connection';

/**
 * One function that turns anything thrown by a query or a mutation into a
 * decision a screen can act on (SPEC §4, §14).
 *
 * The client never parses a server message — messages stay English for logs.
 * It switches on `appCode`, which the server's `errorFormatter` carries through
 * on `shape.data.appCode`, and localizes from that.
 *
 * The three failures the screens have to tell apart:
 *
 *   `offline`     nothing answered. The clinic PC is off, or the phone is off
 *                 the tailnet. Reads fall back to cache; a write must be shown
 *                 as failed, never as saved (§14 — writes are not queued).
 *   `server`      the server answered and something broke inside it. Not the
 *                 user's doing, and worth reporting (§17).
 *   `constraint`  the server answered and refused: the slot is taken, the visit
 *                 is already checked out, the tooth is required. Expected
 *                 outcomes, each with its own sentence on screen, and never
 *                 reported as an incident.
 */

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
    /** What the client localizes from. `INTERNAL` when the server never answered. */
    code: ErrorCode;
    /** Null when there was no HTTP response at all. */
    httpStatus: number | null;
    /** Whether trying the same call again could plausibly work. */
    retryable: boolean;
    /** §17: expected domain outcomes are not incidents and are not reported. */
    reportable: boolean;
}

/**
 * Domain rules the server enforces and the screens explain. `SLOT_OVERLAP` is
 * the one that matters most — it is the Postgres exclusion constraint refusing
 * a double booking (§5), and the secretary is standing in front of the patient
 * when it happens, so "that time was just taken" has to be sayable.
 */
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

/** Bad input that a field can point at. */
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

        // A link that never got a response leaves no `data`: the fetch itself
        // threw, which on a phone means the clinic PC is unreachable.
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
        // INTERNAL, DB_UNAVAILABLE, and anything a newer server invents.
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

/** The code to localize from, whatever was thrown. */
export function errorCodeOf(error: unknown): ErrorCode {
    return classifyError(error).code;
}

/** The double-booking case, by name, because three screens ask for it. */
export function isSlotOverlap(error: unknown): boolean {
    return classifyError(error).code === ERROR_CODE.SLOT_OVERLAP;
}

export function isOffline(error: unknown): boolean {
    const kind = classifyError(error).kind;
    return kind === 'offline' || kind === 'timeout';
}
