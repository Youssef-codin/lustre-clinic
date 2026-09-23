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
// By file, not through `../../day`: that barrel mounts screens that open this
// cluster, and the queue rule is all this needs.
import { arrivalQueue } from '../../day/chair';
import { checkInTimes, api as dayApi } from '../../day/data';
import { todayKey } from '../../day/time';
import { PatientsRequestError } from './requestError';
import type {
    AddedHistoricalProcedures,
    AddedOldVisit,
    AddHistoricalProceduresInput,
    AddOldVisitInput,
    CreatePatientInput,
    CustomQuestion,
    Patient,
    PatientBalance,
    PatientDetail,
    RecentPatients,
    RefEdit,
    SettleInput,
    SettleReport,
    UpdatePatientInput,
    UpdatePatientRefInput,
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

/**
 * Who is in the chair today at the branch this appointment is booked in, read
 * the way the day view reads it: today's rows for that branch, ordered by
 * arrival (`arrivalQueue`). A record's history row carries the status and not
 * the queue, and `checked_in` alone cannot tell the chair from the waiting room.
 */
export async function chairToday(appointmentId: string): Promise<string | null> {
    const rows = await dayApi.byDate(todayKey());
    const branchId = rows.find((row) => row.id === appointmentId)?.branchId;
    if (branchId === undefined) return null;

    const branch = rows.filter((row) => row.branchId === branchId);
    const arrived = branch.filter((row) => row.status === 'checked_in').map((row) => row.id);
    const { checkedInAt } = await checkInTimes(arrived);
    return arrivalQueue(branch, checkedInAt).chair?.id ?? null;
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
     * Work the patient had done before this system recorded it. It is a
     * `procedure` call and not a `patient` one because what it writes is
     * appointment rows: `patient.update` patches the record's own columns and
     * takes no procedures.
     *
     * Never retried. The write is not idempotent — a second call adds the lines
     * a second time — so the editor clears the drafted entries the moment this
     * succeeds, and a failure keeps them on screen to be sent again once.
     */
    addHistorical(input: AddHistoricalProceduresInput): Promise<AddedHistoricalProcedures> {
        return wrap(() => trpcClient.procedure.addHistorical.mutate(input));
    },

    /**
     * Correcting the record's number, which `patient.update` deliberately
     * cannot do: the server gates it by role and writes an audit row, so it is
     * its own procedure and its own call here.
     */
    updateRef(input: UpdatePatientRefInput): Promise<Patient> {
        return wrap(() => trpcClient.patient.updateRef.mutate(input));
    },

    /**
     * Every correction made to this record's number, newest first. Answers `[]`
     * rather than refusing for a record that is gone — the trail outlives it.
     */
    refHistory(id: string): Promise<RefEdit[]> {
        return wrap(() => trpcClient.patient.refHistory.query({ id }));
    },

    /**
     * A visit that happened on a day that has passed and was never typed in.
     * This one bills: what comes back is charged and the patient owes it, so
     * the record's outstanding strip moves and `balance.settle` is how it gets
     * paid — there is no second place money is taken.
     *
     * Never retried, for the reason `addHistorical` gives: a second call writes
     * a second visit, and this one has money on it.
     */
    addOldVisit(input: AddOldVisitInput): Promise<AddedOldVisit> {
        return wrap(() => trpcClient.procedure.addOldVisit.mutate(input));
    },

    /**
     * The record and everything under it. Refused while any of their visits
     * has a payment. Resolves to `true` rather than nothing: `useMutation`
     * hands back `undefined` for a failure, and a call that returned nothing
     * on success would be indistinguishable from one.
     */
    async delete(id: string): Promise<true> {
        await wrap(() => trpcClient.patient.delete.mutate({ id }));
        return true;
    },

    /**
     * The app's one payment entry point. The money goes against the patient and
     * the server allocates it across their unsettled visits oldest-first, so
     * nothing here names a visit and nothing here does arithmetic on a balance
     * (§10). What comes back is the split, which the sheet reads out.
     *
     * Never retried: a silent retry after a Tailscale timeout takes the money
     * twice. `useMutation` in `./hooks` refuses an overlapping call rather
     * than queueing it, which is the other half of the same guarantee.
     */
    settle(input: SettleInput): Promise<SettleReport> {
        return wrap(() => trpcClient.balance.settle.mutate(input));
    },
};
