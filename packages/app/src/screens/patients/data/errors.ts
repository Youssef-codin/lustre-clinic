// What a failed call says to the user. The client switches on `ERROR_CODE` and
// never parses or renders the server's message — those stay English, for logs.
// There is no localisation scaffold yet, so the strings are English here; when
// the dictionaries land, these values become keys into them and no call site
// changes. Offline is its own line: the clinic server is a PC that is off
// during a power cut, and "check the connection" is the useful instruction.
// An unrecognised code falls back to the same line as a transport failure —
// from the desk they are the same event.
import { PatientsRequestError } from './requestError';

const TEXT: Record<string, string> = {
    NOT_FOUND: 'This patient is no longer on file.',
    VALIDATION: 'One of the answers was not accepted. Check it and try again.',
    CUSTOM_QUESTION_REQUIRED: 'A required question was left blank.',
    CONFLICT: 'Someone else changed this record. Reopen it and try again.',
    INTERNAL: 'The clinic server could not answer. Try again in a moment.',
};

const OFFLINE = 'Could not reach the clinic server. Check the connection and try again.';

export function errorText(error: unknown): string {
    if (!(error instanceof PatientsRequestError)) return OFFLINE;
    if (error.offline) return OFFLINE;
    return TEXT[error.code] ?? OFFLINE;
}
