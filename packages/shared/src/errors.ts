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
    /** Check-in was attempted on an appointment that is not on today's clinic day. */
    CHECK_IN_NOT_TODAY: 'CHECK_IN_NOT_TODAY',
    /** The visit is already checked out. */
    VISIT_ALREADY_COMPLETED: 'VISIT_ALREADY_COMPLETED',
    /** Checkout of a visit with no procedures on it. An opening balance is exempt. */
    VISIT_HAS_NO_PROCEDURES: 'VISIT_HAS_NO_PROCEDURES',
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
    /**
     * A delete would take recorded money with it. A visit or a patient with a
     * payment on file is refused: the row is a fact about the drawer, and
     * removing it would quietly change a past day's takings. Delete the payments
     * first if they too were a mistake.
     */
    HAS_PAYMENTS: 'HAS_PAYMENTS',

    // --- patients -----------------------------------------------------------
    /** The phone number could not be normalized to E.164. */
    INVALID_PHONE: 'INVALID_PHONE',
    /** A required custom question was left unanswered. */
    CUSTOM_QUESTION_REQUIRED: 'CUSTOM_QUESTION_REQUIRED',
    /** A custom question `key` is already in use. */
    DUPLICATE_KEY: 'DUPLICATE_KEY',
    /** The next patient number was set at or below a ref a patient already has. */
    PATIENT_REF_BELOW_EXISTING: 'PATIENT_REF_BELOW_EXISTING',
    /** An old patient's ref is already another patient's ref. */
    PATIENT_REF_TAKEN: 'PATIENT_REF_TAKEN',
    /**
     * An old patient's ref is a number the new-patient sequence has still to
     * hand out. Taking it would hand the same number to two patients.
     */
    PATIENT_REF_RESERVED: 'PATIENT_REF_RESERVED',
    /** A ref was edited to something that is not a valid ref for that record. */
    PATIENT_REF_INVALID: 'PATIENT_REF_INVALID',
    /**
     * A ref edit was declared by a role that is not allowed to make one. With no
     * accounts (§1) the role is the client's own word for itself, so this is a
     * guard rail rather than authentication — see `REF_EDIT_ROLES`.
     */
    REF_EDIT_FORBIDDEN: 'REF_EDIT_FORBIDDEN',
    /**
     * An old patient arrived with money owed or work done, and the clinic has
     * not said which branch and cutoff date that history hangs on (§12).
     */
    MIGRATION_NOT_CONFIGURED: 'MIGRATION_NOT_CONFIGURED',
    /**
     * An old procedure was dated after the migration cutoff. Work done since
     * the changeover was done here, and belongs in a visit rather than in
     * imported history that every operational view leaves out.
     */
    IMPORTED_DATE_AFTER_CUTOFF: 'IMPORTED_DATE_AFTER_CUTOFF',

    // --- backups (§16) ------------------------------------------------------
    /** No Android OAuth client is configured, so the phone cannot run the consent step. */
    DRIVE_SIGN_IN_UNCONFIGURED: 'DRIVE_SIGN_IN_UNCONFIGURED',
    /** Google refused the authorization code, or the backup folder could not be created. */
    DRIVE_LINK_FAILED: 'DRIVE_LINK_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export const ERROR_CODES = Object.values(ERROR_CODE) as readonly ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
    return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
