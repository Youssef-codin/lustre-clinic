import { _LocalApiError } from './_LocalPatientsApi';

/**
 * What a failed call says to the user.
 *
 * SPEC §14 and §4: the client switches on `ERROR_CODE` and localises from it,
 * and never parses or renders the server's message — those stay English, for
 * logs, and they name keys and internals that mean nothing to a secretary.
 *
 * There is no localisation scaffold yet (SPEC §18 F4), so the right-hand side
 * is English here. That is the *string table* being missing, not the rule: when
 * the dictionaries land, this map's values become keys into them and no call
 * site changes.
 */

const TEXT: Record<string, string> = {
    NOT_FOUND: 'This patient is no longer on file.',
    VALIDATION: 'One of the answers was not accepted. Check it and try again.',
    CUSTOM_QUESTION_REQUIRED: 'A required question was left blank.',
    CONFLICT: 'Someone else changed this record. Reopen it and try again.',
    INTERNAL: 'The clinic server could not answer. Try again in a moment.',
};

/**
 * An unrecognised code and a transport failure get the same line: from the
 * desk they are the same event — it did not work, try again — and inventing a
 * distinct sentence per code the server might grow would be guessing.
 */
const UNKNOWN = 'Could not reach the clinic server. Check the connection and try again.';

export function errorText(error: unknown): string {
    if (error instanceof _LocalApiError) return TEXT[error.code] ?? UNKNOWN;
    return UNKNOWN;
}
