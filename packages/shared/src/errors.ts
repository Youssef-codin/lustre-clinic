/**
 * The error contract between server and client (SPEC §4).
 *
 * Services throw `AppError { code, message, httpStatus }`. The tRPC
 * `errorFormatter` carries `code` through as `shape.data.appCode`. The client
 * switches on it and localizes from it — it never parses `message`. Server
 * messages stay English, for logs.
 *
 * Codes are stable strings. Renaming one is a breaking contract change.
 */
export const ERROR_CODE = {
    /** Generic fallback. The client shows a non-specific failure message. */
    INTERNAL: 'INTERNAL',
    /** Input failed Zod validation. */
    VALIDATION: 'VALIDATION',
    /** The addressed row does not exist. */
    NOT_FOUND: 'NOT_FOUND',
    /** The database is unreachable or a query failed. */
    DB_UNAVAILABLE: 'DB_UNAVAILABLE',

    // --- appointments -------------------------------------------------------
    /** The requested slot overlaps a booked or checked-in appointment (§5). */
    SLOT_OVERLAP: 'SLOT_OVERLAP',
    /** The status transition is not one of those allowed by §7. */
    INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
    /** Duration is not one of `settings.duration_options`. */
    INVALID_DURATION: 'INVALID_DURATION',
    /** Could not allocate a unique `ref` for the day after repeated attempts. */
    REF_GENERATION_FAILED: 'REF_GENERATION_FAILED',

    // --- visits -------------------------------------------------------------
    /** Check-in was attempted on an appointment that already has a visit. */
    VISIT_ALREADY_EXISTS: 'VISIT_ALREADY_EXISTS',
    /** The visit is already checked out. */
    VISIT_ALREADY_COMPLETED: 'VISIT_ALREADY_COMPLETED',
    /** A category row was selected; only leaf procedures are selectable (§5). */
    PROCEDURE_NOT_SELECTABLE: 'PROCEDURE_NOT_SELECTABLE',
    /** A `has_quantity: false` procedure appeared more than once on a visit. */
    PROCEDURE_DUPLICATE: 'PROCEDURE_DUPLICATE',
    /** Procedure nesting is one level deep; a subtype may not have children. */
    PROCEDURE_NESTING_TOO_DEEP: 'PROCEDURE_NESTING_TOO_DEEP',
    /** An `is_tooth_specific` procedure went on a visit with no tooth (§5). */
    TOOTH_REQUIRED: 'TOOTH_REQUIRED',
    /** A tooth was given for a procedure that is not tooth-specific (§5). */
    TOOTH_NOT_APPLICABLE: 'TOOTH_NOT_APPLICABLE',

    // --- money --------------------------------------------------------------
    /** An amount was negative, or otherwise outside its allowed range. */
    INVALID_AMOUNT: 'INVALID_AMOUNT',
    /** `method` is `other` but `methodNote` was not supplied (§5). */
    PAYMENT_NOTE_REQUIRED: 'PAYMENT_NOTE_REQUIRED',
    /**
     * A patient-level payment was larger than what the patient owes. A credit
     * balance is not a concept the model has — §10 derives every balance from
     * charges and payments — so the money is refused rather than parked.
     */
    PAYMENT_EXCEEDS_BALANCE: 'PAYMENT_EXCEEDS_BALANCE',
    /** A payment was allocated against a patient with nothing outstanding. */
    NOTHING_OUTSTANDING: 'NOTHING_OUTSTANDING',

    // --- patients -----------------------------------------------------------
    /** The phone number could not be normalized to E.164. */
    INVALID_PHONE: 'INVALID_PHONE',
    /** A required custom question was left unanswered. */
    CUSTOM_QUESTION_REQUIRED: 'CUSTOM_QUESTION_REQUIRED',
    /** A custom question `key` is already in use. */
    DUPLICATE_KEY: 'DUPLICATE_KEY',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export const ERROR_CODES = Object.values(ERROR_CODE) as readonly ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
    return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
