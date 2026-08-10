import { ERROR_CODE, type ErrorCode, type PaymentMethod } from '@mawid/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

// The tRPC client and the connection hook (§10, Spec §18 F2) have not landed —
// `packages/app` has no `@trpc/client` and no `@tanstack/react-query`. Built
// local per the §10 rule; see BLOCKED.md #2 and #3.
//
// Two things this file is careful about, because the cluster's correctness rests
// on them:
//
//  1. Every balance is DERIVED here, from `charged_total` minus the payment rows
//     (Spec §10), exactly as `balance.service.ts` derives it. Nothing is stored
//     and nothing is cached. The screens render what this returns and never do
//     arithmetic on money themselves — which is the whole point of the rule, and
//     is what keeps them honest when this file is replaced by the real client.
//  2. The hooks have the shape TanStack Query's bindings have, so swapping to
//     `trpc.balance.outstanding.useQuery()` is a rename at the call site.
//
// The types below are copied from `balance.service.ts` and `visit.service.ts` by
// hand rather than inferred from `AppRouter`, because the app does not depend on
// the server package (BLOCKED.md #3). `Date` fields are `string`: there is no
// transformer on `trpc/init.ts`, so dates arrive as ISO strings.

// --- the contract, mirrored ------------------------------------------------

/** `balance.outstanding` — a patient and what they owe across every visit. */
export interface PatientBalance {
    patientId: string;
    name: string;
    phone: string;
    balance: number;
    /** Start of the oldest visit that still owes something. */
    oldestUnpaidAt: string;
}

export interface OutstandingReport {
    total: number;
    patients: PatientBalance[];
}

/** `balance.byPatient` — that patient's visits which still owe something. */
export interface VisitBalance {
    visitId: string;
    appointmentId: string;
    ref: string;
    startsAt: string;
    chargedTotal: number;
    paidTotal: number;
    balance: number;
}

/** `balance.summary` — charged versus collected over a period. */
export interface BalanceSummary {
    charged: number;
    collected: number;
    /** `charged - collected` over the period, not the standing balance. */
    difference: number;
}

/** Nested inside `visit.byId`. */
export interface VisitPayment {
    id: string;
    amount: number;
    method: PaymentMethod;
    methodNote: string | null;
    paidAt: string;
}

/**
 * The slice of `visit.byId` the money cluster reads.
 *
 * These are the `visits` table's own columns plus what the service derives —
 * and nothing else. `ref`, `startsAt` and the patient's name belong to the
 * appointment and the patient, and `visit.byId` does not join either, so a
 * screen that wants them takes them from the `balance.byPatient` row it was
 * reached through. Declaring them here would have made the swap BLOCKED.md #2
 * promises fail silently: a header falling back to a placeholder and a date
 * rendering `NaN undefined NaN`. See BLOCKED.md #14.
 *
 * `procedures` is omitted deliberately — the money screens do not price a
 * visit, they only settle it.
 */
export interface VisitDetail {
    id: string;
    appointmentId: string;
    checkedInAt: string;
    completedAt: string | null;
    /** Rule output from the entered procedures (§9). Never edited. */
    computedTotal: number;
    /** What the patient owes. The difference from computed is the discount. */
    chargedTotal: number;
    payments: VisitPayment[];
    paidTotal: number;
    /** Derived, never stored (§10). */
    balance: number;
}

/** Does not exist on the server — see BLOCKED.md #5. */
export interface MethodTaking {
    method: PaymentMethod;
    amount: number;
    count: number;
}

export interface TakingsReport {
    total: number;
    byMethod: MethodTaking[];
}

export interface RecordPaymentInput {
    visitId: string;
    /** Integer piastres, positive. */
    amount: number;
    method: PaymentMethod;
    methodNote?: string | null;
}

// --- fixtures ---------------------------------------------------------------

type StoredPatient = { id: string; name: string; phone: string };

type StoredVisit = {
    id: string;
    appointmentId: string;
    /** Not on the `visits` row — held here so the stub can serve the queries
     * that DO join the appointment, `balance.byPatient` and
     * `balance.outstanding`. `visit.byId` must not return it. */
    patientId: string;
    ref: string;
    startsAt: string;
    checkedInAt: string;
    completedAt: string | null;
    computedTotal: number;
    chargedTotal: number;
    payments: VisitPayment[];
};

const patients: StoredPatient[] = [
    { id: 'p-1', name: 'Mariam Hassan', phone: '+201005550134' },
    { id: 'p-2', name: 'أحمد سيد', phone: '+201224478890' },
    { id: 'p-3', name: 'Nour El-Din Fathy', phone: '+201099213307' },
    { id: 'p-4', name: 'Omar Khaled', phone: '+201211640058' },
    { id: 'p-5', name: 'Salma Adel', phone: '+201007729415' },
    { id: 'p-6', name: 'Hana Mostafa', phone: '+201155038822' },
];

/**
 * Amounts are piastres. The store is mutable so that recording a payment moves
 * every figure derived from it — which is the only way the pending state and the
 * clamp are worth anything to look at.
 */
const visits: StoredVisit[] = [
    {
        id: 'v-1',
        appointmentId: 'a-1',
        patientId: 'p-1',
        ref: '020526-K7QP',
        startsAt: '2026-05-02T10:30:00.000Z',
        checkedInAt: '2026-05-02T10:30:00.000Z',
        completedAt: '2026-05-02T10:30:00.000Z',
        computedTotal: 400_000,
        chargedTotal: 400_000,
        payments: [
            {
                id: 'y-1',
                amount: 140_000,
                method: 'cash',
                methodNote: null,
                paidAt: '2026-05-02T11:20:00.000Z',
            },
        ],
    },
    {
        id: 'v-2',
        appointmentId: 'a-2',
        patientId: 'p-1',
        ref: '190626-M2XR',
        startsAt: '2026-06-19T12:00:00.000Z',
        checkedInAt: '2026-06-19T12:00:00.000Z',
        completedAt: '2026-06-19T12:00:00.000Z',
        computedTotal: 175_000,
        chargedTotal: 175_000,
        payments: [],
    },
    {
        id: 'v-3',
        appointmentId: 'a-3',
        patientId: 'p-2',
        ref: '280726-T9WB',
        startsAt: '2026-07-28T09:15:00.000Z',
        checkedInAt: '2026-07-28T09:15:00.000Z',
        completedAt: '2026-07-28T09:15:00.000Z',
        computedTotal: 1_500_000,
        chargedTotal: 1_500_000,
        payments: [
            {
                id: 'y-2',
                amount: 300_000,
                method: 'visa',
                methodNote: null,
                paidAt: '2026-07-28T10:05:00.000Z',
            },
        ],
    },
    {
        id: 'v-4',
        appointmentId: 'a-4',
        patientId: 'p-3',
        ref: '140126-H4KN',
        startsAt: '2026-01-14T16:45:00.000Z',
        checkedInAt: '2026-01-14T16:45:00.000Z',
        completedAt: '2026-01-14T16:45:00.000Z',
        computedTotal: 120_000,
        chargedTotal: 120_000,
        payments: [
            {
                id: 'y-3',
                amount: 30_000,
                method: 'cash',
                methodNote: null,
                paidAt: '2026-01-14T17:30:00.000Z',
            },
        ],
    },
    {
        id: 'v-5',
        appointmentId: 'a-5',
        patientId: 'p-3',
        ref: '220326-R6DS',
        startsAt: '2026-03-22T11:00:00.000Z',
        checkedInAt: '2026-03-22T11:00:00.000Z',
        completedAt: '2026-03-22T11:00:00.000Z',
        computedTotal: 45_000,
        chargedTotal: 45_000,
        payments: [],
    },
    {
        id: 'v-6',
        appointmentId: 'a-6',
        patientId: 'p-3',
        ref: '090626-B3VC',
        startsAt: '2026-06-09T13:20:00.000Z',
        checkedInAt: '2026-06-09T13:20:00.000Z',
        completedAt: '2026-06-09T13:20:00.000Z',
        computedTotal: 30_000,
        chargedTotal: 30_000,
        payments: [],
    },
    {
        id: 'v-7',
        appointmentId: 'a-7',
        patientId: 'p-4',
        ref: '040826-N8FJ',
        startsAt: '2026-08-04T09:00:00.000Z',
        checkedInAt: '2026-08-04T09:00:00.000Z',
        completedAt: '2026-08-04T09:00:00.000Z',
        computedTotal: 520_000,
        chargedTotal: 520_000,
        payments: [],
    },
    {
        id: 'v-8',
        appointmentId: 'a-8',
        patientId: 'p-5',
        ref: '080826-Q5ZT',
        startsAt: '2026-08-08T15:10:00.000Z',
        checkedInAt: '2026-08-08T15:10:00.000Z',
        completedAt: '2026-08-08T15:10:00.000Z',
        computedTotal: 90_000,
        chargedTotal: 90_000,
        payments: [
            {
                id: 'y-4',
                amount: 35_000,
                method: 'instapay',
                methodNote: null,
                paidAt: '2026-08-08T15:55:00.000Z',
            },
        ],
    },
    // Settled in full. Here to prove it is excluded from both balance queries.
    {
        id: 'v-9',
        appointmentId: 'a-9',
        patientId: 'p-6',
        ref: '060826-L2YH',
        startsAt: '2026-08-06T10:00:00.000Z',
        checkedInAt: '2026-08-06T10:00:00.000Z',
        completedAt: '2026-08-06T10:00:00.000Z',
        computedTotal: 260_000,
        chargedTotal: 260_000,
        payments: [
            {
                id: 'y-5',
                amount: 160_000,
                method: 'cash',
                methodNote: null,
                paidAt: '2026-08-06T10:40:00.000Z',
            },
            {
                id: 'y-6',
                amount: 100_000,
                method: 'other',
                methodNote: 'Bank transfer',
                paidAt: '2026-08-07T09:05:00.000Z',
            },
        ],
    },
];

export const PERIODS = ['today', 'week', 'month', 'year', 'all'] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
    today: 'Today',
    week: 'This week',
    month: 'This month',
    year: 'This year',
    all: 'All time',
};

/**
 * Per-period figures. `collected` is not written down: it is summed from the
 * method rows, so the takings card and the hero can never disagree about how
 * much came in — which is the bug this fixture would otherwise invite.
 */
const PERIOD_FIXTURES: Record<Period, { charged: number; byMethod: Record<PaymentMethod, MethodTaking> }> = {
    today: {
        charged: 340_000,
        byMethod: {
            cash: { method: 'cash', amount: 180_000, count: 3 },
            visa: { method: 'visa', amount: 95_000, count: 1 },
            instapay: { method: 'instapay', amount: 0, count: 0 },
            other: { method: 'other', amount: 0, count: 0 },
        },
    },
    week: {
        charged: 2_410_000,
        byMethod: {
            cash: { method: 'cash', amount: 1_120_000, count: 14 },
            visa: { method: 'visa', amount: 640_000, count: 6 },
            instapay: { method: 'instapay', amount: 210_000, count: 2 },
            other: { method: 'other', amount: 0, count: 0 },
        },
    },
    month: {
        charged: 14_262_000,
        byMethod: {
            cash: { method: 'cash', amount: 6_540_000, count: 71 },
            visa: { method: 'visa', amount: 3_120_000, count: 28 },
            instapay: { method: 'instapay', amount: 1_980_000, count: 19 },
            other: { method: 'other', amount: 240_000, count: 2 },
        },
    },
    year: {
        charged: 89_400_000,
        byMethod: {
            cash: { method: 'cash', amount: 41_200_000, count: 462 },
            visa: { method: 'visa', amount: 22_900_000, count: 198 },
            instapay: { method: 'instapay', amount: 12_400_000, count: 131 },
            other: { method: 'other', amount: 1_150_000, count: 9 },
        },
    },
    all: {
        charged: 122_650_000,
        byMethod: {
            cash: { method: 'cash', amount: 58_300_000, count: 688 },
            visa: { method: 'visa', amount: 30_100_000, count: 271 },
            instapay: { method: 'instapay', amount: 15_600_000, count: 166 },
            other: { method: 'other', amount: 1_900_000, count: 15 },
        },
    },
};

// --- the stubbed procedures -------------------------------------------------

/** Long enough that a pending state is visible on a device, per §14's Tailscale hop. */
const LATENCY_MS = 450;

let failing = false;

/**
 * Flips every procedure to a transport failure, so the loading and error states
 * on each screen can be looked at rather than reasoned about. Called from a dev
 * control, never from a screen.
 */
export function setStubFailing(value: boolean): void {
    failing = value;
}

class StubError extends Error {
    constructor(readonly code: ErrorCode) {
        super(code);
    }
}

function reply<T>(produce: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (failing) {
                reject(new StubError(ERROR_CODE.DB_UNAVAILABLE));
                return;
            }
            try {
                resolve(produce());
            } catch (error) {
                reject(error);
            }
        }, LATENCY_MS);
    });
}

function paidTotalOf(visit: StoredVisit): number {
    return visit.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

/** Spec §10 — derived, never stored. */
function balanceOf(visit: StoredVisit): number {
    return visit.chargedTotal - paidTotalOf(visit);
}

/** Exactly what `visit.byId` returns for the fields the money cluster reads. */
function detailOf(visit: StoredVisit): VisitDetail {
    return {
        id: visit.id,
        appointmentId: visit.appointmentId,
        checkedInAt: visit.checkedInAt,
        completedAt: visit.completedAt,
        computedTotal: visit.computedTotal,
        chargedTotal: visit.chargedTotal,
        payments: [...visit.payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
        paidTotal: paidTotalOf(visit),
        balance: balanceOf(visit),
    };
}

export const moneyApi = {
    /** `balance.outstanding` — patients who owe something, aggregated (§10). */
    outstanding(): Promise<OutstandingReport> {
        return reply(() => {
            const rows: PatientBalance[] = [];

            for (const patient of patients) {
                const owing = visits.filter((v) => v.patientId === patient.id && balanceOf(v) > 0);
                if (owing.length === 0) continue;

                rows.push({
                    patientId: patient.id,
                    name: patient.name,
                    phone: patient.phone,
                    balance: owing.reduce((sum, v) => sum + balanceOf(v), 0),
                    oldestUnpaidAt: owing.reduce(
                        (oldest, v) => (v.startsAt < oldest ? v.startsAt : oldest),
                        owing[0]?.startsAt ?? '',
                    ),
                });
            }

            rows.sort((a, b) => b.balance - a.balance);

            return { total: rows.reduce((sum, row) => sum + row.balance, 0), patients: rows };
        });
    },

    /** `balance.byPatient` — that patient's visits which still owe something. */
    byPatient(patientId: string): Promise<VisitBalance[]> {
        return reply(() =>
            visits
                .filter((v) => v.patientId === patientId && balanceOf(v) > 0)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                .map((v) => ({
                    visitId: v.id,
                    appointmentId: v.appointmentId,
                    ref: v.ref,
                    startsAt: v.startsAt,
                    chargedTotal: v.chargedTotal,
                    paidTotal: paidTotalOf(v),
                    balance: balanceOf(v),
                })),
        );
    },

    /** `visit.byId`, narrowed to what the money cluster reads. */
    visit(visitId: string): Promise<VisitDetail> {
        return reply(() => {
            const visit = visits.find((v) => v.id === visitId);
            if (!visit) throw new StubError(ERROR_CODE.NOT_FOUND);

            return detailOf(visit);
        });
    },

    /** `balance.summary` for the period tab. */
    summary(period: Period): Promise<BalanceSummary> {
        return reply(() => {
            const fixture = PERIOD_FIXTURES[period];
            const collected = Object.values(fixture.byMethod).reduce((sum, row) => sum + row.amount, 0);
            return { charged: fixture.charged, collected, difference: fixture.charged - collected };
        });
    },

    /** The endpoint that does not exist yet — BLOCKED.md #5. */
    takings(period: Period): Promise<TakingsReport> {
        return reply(() => {
            const byMethod = Object.values(PERIOD_FIXTURES[period].byMethod);
            return { total: byMethod.reduce((sum, row) => sum + row.amount, 0), byMethod };
        });
    },

    /**
     * `visit.recordPayment` — appends to `payments`. It does not touch
     * `charged_total` (§10), so the balance moves only because a row was added.
     */
    recordPayment(input: RecordPaymentInput): Promise<VisitDetail> {
        return reply(() => {
            const visit = visits.find((v) => v.id === input.visitId);
            if (!visit) throw new StubError(ERROR_CODE.NOT_FOUND);
            if (input.amount <= 0) throw new StubError(ERROR_CODE.INVALID_AMOUNT);
            if (input.method === 'other' && !input.methodNote?.trim()) {
                throw new StubError(ERROR_CODE.PAYMENT_NOTE_REQUIRED);
            }

            visit.payments.push({
                id: `y-${Date.now()}`,
                amount: input.amount,
                method: input.method,
                methodNote: input.methodNote?.trim() || null,
                paidAt: new Date().toISOString(),
            });

            return detailOf(visit);
        });
    },
};

// --- hooks, shaped like the TanStack Query bindings -------------------------

export function errorCodeOf(error: unknown): ErrorCode {
    return error instanceof StubError ? error.code : ERROR_CODE.INTERNAL;
}

export type QueryResult<T> = {
    data: T | undefined;
    isLoading: boolean;
    error: ErrorCode | null;
    refetch: () => void;
};

type QueryState<T> = { data: T | undefined; isLoading: boolean; error: ErrorCode | null };

/**
 * `key` is what re-runs the query, standing in for TanStack Query's query key.
 * The fetcher is held in a ref so a fresh closure each render does not re-fetch.
 */
function useStubQuery<T>(key: string, fetcher: () => Promise<T>): QueryResult<T> {
    const fetcherRef = useRef(fetcher);
    const [nonce, setNonce] = useState(0);
    const [state, setState] = useState<QueryState<T>>({ data: undefined, isLoading: true, error: null });

    useEffect(() => {
        fetcherRef.current = fetcher;
    });

    // `key` and `nonce` are the cache key, not values the effect reads: it
    // re-runs *because* they changed, which is how a query key behaves and what
    // `refetch` and the cluster's `version` both drive. Biome sees them unused
    // in the body and offers to drop them, which would pin every screen to its
    // first response.
    // biome-ignore lint/correctness/useExhaustiveDependencies: cache key, not a read value
    useEffect(() => {
        let cancelled = false;
        setState((previous) => ({ ...previous, isLoading: true, error: null }));

        fetcherRef.current().then(
            (data) => {
                if (!cancelled) setState({ data, isLoading: false, error: null });
            },
            (error: unknown) => {
                // The previous data is dropped rather than left on screen under
                // an error. A stale balance that looks current is the failure
                // mode this cluster can least afford.
                if (!cancelled) setState({ data: undefined, isLoading: false, error: errorCodeOf(error) });
            },
        );

        return () => {
            cancelled = true;
        };
    }, [key, nonce]);

    const refetch = useCallback(() => setNonce((value) => value + 1), []);

    return { ...state, refetch };
}

/**
 * `version` is part of every key so that recording a payment can invalidate the
 * lot at once — the cluster bumps it and every derived figure on every mounted
 * screen re-reads. It stands in for `queryClient.invalidateQueries`, and it is
 * the reason nothing in this cluster needs to patch a balance locally after a
 * write: the server is asked again instead.
 */
export function useOutstanding(version = 0): QueryResult<OutstandingReport> {
    return useStubQuery(`balance.outstanding:${version}`, () => moneyApi.outstanding());
}

export function useBalanceSummary(period: Period, version = 0): QueryResult<BalanceSummary> {
    return useStubQuery(`balance.summary:${period}:${version}`, () => moneyApi.summary(period));
}

export function useTakings(period: Period, version = 0): QueryResult<TakingsReport> {
    return useStubQuery(`balance.takings:${period}:${version}`, () => moneyApi.takings(period));
}

export function useVisitsByPatient(patientId: string, version = 0): QueryResult<VisitBalance[]> {
    return useStubQuery(`balance.byPatient:${patientId}:${version}`, () => moneyApi.byPatient(patientId));
}

export function useVisit(visitId: string, version = 0): QueryResult<VisitDetail> {
    return useStubQuery(`visit.byId:${visitId}:${version}`, () => moneyApi.visit(visitId));
}

export type MutationResult<TInput, TOutput> = {
    mutate: (input: TInput) => Promise<TOutput | undefined>;
    isPending: boolean;
    error: ErrorCode | null;
    reset: () => void;
};

/**
 * Every mutation in the cluster goes through this, because every mutation needs
 * a pending state: the write crosses Tailscale to a PC in the clinic, and a
 * payment button that still looks idle gets pressed twice.
 */
export function useRecordPayment(): MutationResult<RecordPaymentInput, VisitDetail> {
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ErrorCode | null>(null);

    const mutate = useCallback(async (input: RecordPaymentInput) => {
        setIsPending(true);
        setError(null);
        try {
            return await moneyApi.recordPayment(input);
        } catch (caught) {
            setError(errorCodeOf(caught));
            return undefined;
        } finally {
            setIsPending(false);
        }
    }, []);

    const reset = useCallback(() => setError(null), []);

    return { mutate, isPending, error, reset };
}
