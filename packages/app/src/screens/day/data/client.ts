import { ERROR_CODE, type ErrorCode } from '@mawid/shared';

/**
 * Every failure the UI can be handed, carrying the code it localizes from.
 * §4: the client switches on `ERROR_CODE` and never parses `message`.
 */
export class RequestError extends Error {
    readonly code: ErrorCode;
    /** True when the request never reached the clinic — a power cut, wifi, Tailscale. */
    readonly offline: boolean;

    constructor(code: ErrorCode, message: string, options?: { offline?: boolean; cause?: unknown }) {
        super(message, { cause: options?.cause });
        this.name = 'RequestError';
        this.code = code;
        this.offline = options?.offline ?? false;
    }
}

export function asRequestError(err: unknown): RequestError {
    if (err instanceof RequestError) return err;
    return new RequestError(ERROR_CODE.INTERNAL, err instanceof Error ? err.message : 'request failed', {
        cause: err,
    });
}
