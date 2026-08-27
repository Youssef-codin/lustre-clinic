/**
 * Every call this cluster makes, over the real tRPC client. It replaces
 * `_LocalPatientsApi` (BLOCKED.md §1 — F2 has landed, `src/api` exists), and
 * keeps that module's method names and shapes so the two screens changed one
 * import and nothing else.
 *
 * Two things are done by hand, as in `screens/day/data/day.ts`: dates arrive as
 * ISO strings while the inferred types still say `Date` — `shaped`/`types.ts`
 * bridge that until a transformer lands — and `wrap` turns a tRPC failure into
 * the `ErrorCode` the screens localize from, never a parsed message.
 *
 * `options` is a `jsonb` column, so it arrives as `unknown` and is read the way
 * the server's own `optionsOf` reads it: an array or nothing. `outstanding`
 * takes the report's per-patient rows only — the list wants a balance per
 * patient, and the clinic-wide total belongs to the money cluster.
 */
import { errorCodeOf, isOffline, trpcClient } from '../../../api';
import { PatientsRequestError } from './requestError';
import type {
    CreatePatientInput,
    CustomQuestion,
    Patient,
    PatientBalance,
    PatientDetail,
    RecentPatients,
    SettleInput,
    SettleReport,
    UpdatePatientInput,
} from './types';

function shaped<T>(value: unknown): T {
    return value as T;
}

async function wrap<T>(run: () => Promise<unknown>): Promise<T> {
    try {
        return shaped<T>(await run());
    } catch (err) {
        if (err instanceof PatientsRequestError) throw err;
        throw new PatientsRequestError(
            errorCodeOf(err),
            err instanceof Error ? err.message : 'request failed',
            { offline: isOffline(err), cause: err },
        );
    }
}

/** The `jsonb` column reaches the client as `unknown`; a select's options are an array or nothing. */
function optionsOf(value: unknown): string[] | null {
    return Array.isArray(value) ? (value as string[]) : null;
}

interface OutstandingRow {
    patientId: string;
    balance: number;
}

export const patientsApi = {
    async listQuestions(): Promise<CustomQuestion[]> {
        const rows = await wrap<Array<Omit<CustomQuestion, 'options'> & { options: unknown }>>(() =>
            trpcClient.customQuestion.list.query({ includeInactive: false }),
        );
        return rows.map((row) => ({ ...row, options: optionsOf(row.options) }));
    },

    /**
     * An empty term is not a browse: `patient.search` answers `[]` for one, by
     * design. Browsing is `recent`, which the list calls instead of searching
     * for nothing.
     */
    search(q: string, limit = 25): Promise<Patient[]> {
        return wrap(() => trpcClient.patient.search.query({ q: q.trim(), limit }));
    },

    /** Newest first, plus the size of the whole register for the heading's count. */
    recent(limit = 25): Promise<RecentPatients> {
        return wrap(() => trpcClient.patient.recent.query({ limit }));
    },

    byId(id: string): Promise<PatientDetail> {
        return wrap(() => trpcClient.patient.byId.query({ id }));
    },

    async outstanding(): Promise<PatientBalance[]> {
        const report = await wrap<{ patients: OutstandingRow[] }>(() =>
            trpcClient.balance.outstanding.query(),
        );
        return report.patients.map((row) => ({ patientId: row.patientId, balance: row.balance }));
    },

    /**
     * Registering someone. The whole `custom` form goes with it, because
     * `validateIntake` is the one place the clinic's required questions are
     * enforced — an edit later is only ever validated against the keys it sends.
     */
    create(input: CreatePatientInput): Promise<Patient> {
        return wrap(() => trpcClient.patient.create.mutate(input));
    },

    update(input: UpdatePatientInput): Promise<Patient> {
        return wrap(() => trpcClient.patient.update.mutate(input));
    },

    /**
     * The app's one payment entry point. The money goes against the patient and
     * the server allocates it across their unsettled visits oldest-first, so
     * nothing here names a visit and nothing here does arithmetic on a balance
     * (§10). What comes back is the split, which the sheet reads out.
     *
     * Never retried: a silent retry after a Tailscale timeout takes the money
     * twice. `useMutation` in `_LocalQuery` refuses an overlapping call rather
     * than queueing it, which is the other half of the same guarantee.
     */
    settle(input: SettleInput): Promise<SettleReport> {
        return wrap(() => trpcClient.balance.settle.mutate(input));
    },
};
