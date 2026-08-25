/**
 * Every call the money cluster makes, over the real tRPC client. This replaced
 * `_LocalMoneyApi.ts`, an in-memory store behind TanStack-Query-shaped hooks —
 * a payment recorded against it updated the screen and was gone on reload.
 *
 * The hooks keep that module's names and return shape, so the screens changed
 * their import and little else. Two things they no longer carry:
 *
 * - **No `version`.** The stub had no cache, so a payment three panes deep
 *   bumped a counter every query re-keyed on. There is a real cache now, and
 *   `recordPayment` invalidates `balance` and `visit` on success. Keeping a
 *   hand-rolled cache key beside a query cache is how you end up reconciling
 *   two of them.
 * - **No latency switch.** `setStubFailing` existed to make the failure states
 *   visible; a server that is off does that now.
 *
 * `error` is an `ERROR_CODE`, never a message: the client localizes from the
 * code and never parses what the server said (§4, §14). `isLoading` is
 * `isPending` — no data yet, which is the question a skeleton is asking.
 */
import type { ErrorCode } from '@lustre/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorCodeOf, useTRPC } from '../../../api';
import type { DateRange } from '../money';
import type {
    BalanceSummary,
    OutstandingReport,
    RecordPaymentInput,
    TakingsReport,
    VisitBalance,
    VisitDetail,
} from './types';

export type QueryResult<T> = {
    data: T | undefined;
    isLoading: boolean;
    error: ErrorCode | null;
    refetch: () => void;
};

type RawQuery = {
    data: unknown;
    isPending: boolean;
    error: unknown;
    refetch: () => unknown;
};

/** The one place the `Date`-to-string bridge in `types.ts` is actually applied. */
function shape<T>(query: RawQuery): QueryResult<T> {
    return {
        data: query.data as T | undefined,
        isLoading: query.isPending,
        error: query.error ? errorCodeOf(query.error) : null,
        refetch: () => {
            void query.refetch();
        },
    };
}

export function useOutstanding(): QueryResult<OutstandingReport> {
    const trpc = useTRPC();
    return shape(useQuery(trpc.balance.outstanding.queryOptions()));
}

export function useBalanceSummary(range: DateRange): QueryResult<BalanceSummary> {
    const trpc = useTRPC();
    return shape(useQuery(trpc.balance.summary.queryOptions(range)));
}

export function useTakings(range: DateRange): QueryResult<TakingsReport> {
    const trpc = useTRPC();
    return shape(useQuery(trpc.balance.takings.queryOptions(range)));
}

export function useVisitsByPatient(patientId: string): QueryResult<VisitBalance[]> {
    const trpc = useTRPC();
    return shape(useQuery(trpc.balance.byPatient.queryOptions({ patientId })));
}

export function useVisit(visitId: string): QueryResult<VisitDetail> {
    const trpc = useTRPC();
    return shape(useQuery(trpc.visit.byId.queryOptions({ id: visitId })));
}

export type RecordPaymentResult = {
    mutate: (input: RecordPaymentInput, handlers?: { onSuccess?: () => void }) => void;
    isPending: boolean;
    error: ErrorCode | null;
    reset: () => void;
};

/**
 * The one write this cluster makes. Never retried (§14): a silent retry after a
 * timeout takes the money twice, and `queryClient` already sets `retry: false`
 * on mutations.
 *
 * A payment changes every figure on the dashboard, not just this visit's, so
 * both paths are invalidated rather than patched — §10's rule that no balance
 * is ever recomputed on the client is the whole reason this cluster exists.
 */
export function useRecordPayment(): RecordPaymentResult {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const mutation = useMutation(
        trpc.visit.recordPayment.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries(trpc.balance.pathFilter());
                void queryClient.invalidateQueries(trpc.visit.pathFilter());
            },
        }),
    );

    return {
        mutate: (input, handlers) => mutation.mutate(input, { onSuccess: handlers?.onSuccess }),
        isPending: mutation.isPending,
        error: mutation.error ? errorCodeOf(mutation.error) : null,
        reset: mutation.reset,
    };
}
