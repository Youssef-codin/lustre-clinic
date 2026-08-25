/**
 * What a failure says in this cluster. §4/§14: the sentence is chosen from the
 * `ERROR_CODE` the server sent, never from its message text, which stays
 * English for the logs.
 *
 * Offline comes first and is not a code: the clinic server is a PC that is off
 * during a power cut, and "couldn't reach it" is a different thing to tell
 * someone than "it refused". Panes that can say something more useful than the
 * general sentence for one code pass it in — a `NOT_FOUND` on a branch picker
 * is worth naming, and the pane is the only thing that knows it was a branch.
 */
import { ERROR_CODE, type ErrorCode } from '@lustre/shared';
import { classifyError } from '../../../api';

const OFFLINE = "Couldn't reach the clinic computer. Nothing was saved.";
const GENERAL = 'Something went wrong. Try again.';

const TEXT: Partial<Record<ErrorCode, string>> = {
    [ERROR_CODE.NOT_FOUND]: 'That has been removed. Go back and try again.',
    [ERROR_CODE.DUPLICATE_KEY]: 'A question already uses that key. Pick another.',
    [ERROR_CODE.VALIDATION]: 'Check the fields and try again.',
    [ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP]: 'A category cannot go inside another category.',
    [ERROR_CODE.INVALID_DURATION]: 'The default has to be one of the durations offered.',
    [ERROR_CODE.DB_UNAVAILABLE]: "Couldn't reach the clinic computer.",
};

export function errorText(error: unknown, overrides: Partial<Record<ErrorCode, string>> = {}): string {
    if (!error) return GENERAL;

    const { kind, code } = classifyError(error);
    if (kind === 'offline' || kind === 'timeout') return OFFLINE;

    return overrides[code] ?? TEXT[code] ?? GENERAL;
}
