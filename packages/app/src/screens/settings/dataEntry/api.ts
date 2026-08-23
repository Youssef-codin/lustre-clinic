/**
 * The four calls this pane makes, over the real tRPC client.
 *
 * The rest of the settings cluster still runs on `data/_LocalApi`, the
 * in-memory stand-in from before F2 (BLOCKED.md, *Settings cluster* 1). This
 * pane does not, and cannot: it writes real patients into the real register,
 * and a migration session against a store that does not survive a reload is a
 * morning's typing thrown away. So it goes straight to `../../../api` like the
 * patients and day clusters do, and the stand-in stays where it is until
 * somebody retires it everywhere at once.
 *
 * Inputs and outputs are inferred from `AppRouter` (§3) rather than restated —
 * the hand-written `types.ts` files elsewhere in the app predate the client and
 * are already recorded as a departure. `RequestError` carries the `ERROR_CODE`
 * the pane localizes from; the server's message stays English, for logs.
 */
import { ERROR_CODE, type ErrorCode } from '@lustre/shared';
import { errorCodeOf, isOffline, type RouterOutput, trpcClient } from '../../../api';

export class RequestError extends Error {
    readonly code: ErrorCode;
    readonly offline: boolean;

    constructor(code: ErrorCode, message: string, options?: { offline?: boolean; cause?: unknown }) {
        super(message, { cause: options?.cause });
        this.name = 'RequestError';
        this.code = code;
        this.offline = options?.offline ?? false;
    }
}

async function wrap<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (err) {
        throw new RequestError(errorCodeOf(err), err instanceof Error ? err.message : 'request failed', {
            offline: isOffline(err),
            cause: err,
        });
    }
}

export type EnteredPatient = RouterOutput['migration']['enter'];
export type MigrationProgress = RouterOutput['migration']['progress'];
export type Branch = RouterOutput['branch']['list'][number];

/** Only what the duplicate warning draws. The whole patient is more than the line needs. */
export interface PhoneMatch {
    id: string;
    name: string;
}

export const migrationApi = {
    /** Active branches only — a balance is dated at a branch that still exists. */
    branches(): Promise<Branch[]> {
        return wrap(() => trpcClient.branch.list.query({ includeInactive: false }));
    },

    progress(): Promise<MigrationProgress> {
        return wrap(() => trpcClient.migration.progress.query());
    },

    /**
     * Who is already on file under this number. A half-typed number answers
     * `[]` from the server rather than an error, so this is safe to call on
     * every keystroke the screen decides to call it on.
     */
    async duplicates(phone: string): Promise<PhoneMatch[]> {
        const rows = await wrap(() => trpcClient.patient.byPhone.query({ phone }));
        return rows.map((row) => ({ id: row.id, name: row.name }));
    },

    enter(input: Parameters<typeof trpcClient.migration.enter.mutate>[0]): Promise<EnteredPatient> {
        return wrap(() => trpcClient.migration.enter.mutate(input));
    },
};

/**
 * What a failure says at the desk. §4/§14: localized from the code, never from
 * the server's text. Offline is its own line — the clinic server is a PC that
 * is off during a power cut, and during a migration session the useful thing to
 * say is that the row is still on screen and nothing was lost.
 */
export function errorText(error: unknown): string {
    if (!(error instanceof RequestError)) return 'Something went wrong. Nothing was saved.';
    if (error.offline) {
        return 'Could not reach the clinic server. This patient was not saved — the row is still here, try again.';
    }

    switch (error.code) {
        case ERROR_CODE.INVALID_PHONE:
            return 'That phone number was not accepted. Check it and try again.';
        case ERROR_CODE.INVALID_AMOUNT:
            return 'That balance is outside what the system will hold. Check it and try again.';
        case ERROR_CODE.NOT_FOUND:
            return 'That branch is no longer set up. Pick another one above.';
        case ERROR_CODE.VALIDATION:
            return 'Something in the row was not accepted. Check it and try again.';
        default:
            return 'The clinic server could not save this one. The row is still here — try again.';
    }
}
