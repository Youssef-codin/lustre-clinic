import { useCallback, useEffect, useRef, useState } from 'react';
import { asRequestError, type RequestError } from './client';

/**
 * `_LocalQuery` / `_LocalMutation` — BLOCKED.md. TanStack Query is Phase 1 F2
 * and is not a dependency yet. This is the part of it the day view actually
 * uses: a request with loading and error states, a refetch, and a mutation that
 * reports pending.
 *
 * What it deliberately is not: a cache, a deduper, or a background refetcher.
 * Adding those here would build a second query library that the real one then
 * has to be reconciled with.
 */

export type QueryStatus = 'loading' | 'success' | 'error';

export interface QueryResult<T> {
    data: T | undefined;
    status: QueryStatus;
    error: RequestError | null;
    /** A refetch over data already on screen — a spinner, not a skeleton. */
    refreshing: boolean;
    refetch: () => void;
}

/**
 * `key` is what identifies the request: change it and the query runs again.
 * `run` is read through a ref, so an inline arrow does not refetch on every
 * render — the key is the only thing that does.
 */
export function useLocalQuery<T>(
    key: string,
    run: () => Promise<T>,
    options: { enabled?: boolean } = {},
): QueryResult<T> {
    const enabled = options.enabled ?? true;

    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<RequestError | null>(null);
    const [status, setStatus] = useState<QueryStatus>(enabled ? 'loading' : 'success');
    const [refreshing, setRefreshing] = useState(false);

    const runRef = useRef(run);
    runRef.current = run;

    // Guards against a slow answer for yesterday landing after the tap that
    // moved the screen to today.
    const attempt = useRef(0);

    const load = useCallback(async (isRefresh: boolean) => {
        attempt.current += 1;
        const current = attempt.current;
        if (isRefresh) {
            setRefreshing(true);
        } else {
            // Not a refresh means the key changed, and data from the old key
            // belongs to a different question. Held on to, the calendar pairs
            // this month's days with last month's counts and the card shows
            // yesterday's patients while today loads. Cleared here rather than
            // on error, so a *failed refresh* still keeps the day on screen
            // behind its stale-data banner — same key, still true, just old.
            setData(undefined);
            setStatus('loading');
        }

        try {
            const result = await runRef.current();
            if (attempt.current !== current) return;
            setData(result);
            setError(null);
            setStatus('success');
        } catch (err) {
            if (attempt.current !== current) return;
            setError(asRequestError(err));
            setStatus('error');
        } finally {
            if (attempt.current === current) setRefreshing(false);
        }
    }, []);

    // The one effect this needs: a query is a subscription to a key, and the
    // key changes when the secretary swipes to another day.
    //
    // `key` is not read inside the effect on purpose — it *is* the dependency.
    // `run` is held in a ref so an inline arrow does not refetch on every
    // render, which leaves the key as the only thing that says the request has
    // changed.
    // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the subscription
    useEffect(() => {
        if (!enabled) return;
        void load(false);
    }, [key, enabled, load]);

    const refetch = useCallback(() => {
        void load(data !== undefined);
    }, [load, data]);

    return { data, status, error, refreshing, refetch };
}

export interface MutationResult<I, T> {
    mutate: (input: I, handlers?: { onSuccess?: (result: T) => void }) => void;
    pending: boolean;
    error: RequestError | null;
    reset: () => void;
}

/**
 * Every mutation here crosses Tailscale to a PC in the clinic, so `pending` is
 * not optional decoration: it is what the caller passes to `Button`'s
 * `loading`, and what stops the second tap becoming a second appointment.
 *
 * The error is held rather than thrown. Silent failure is unacceptable — a
 * write that failed must end up on screen, next to the thing it failed to do.
 */
export function useLocalMutation<I, T>(run: (input: I) => Promise<T>): MutationResult<I, T> {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<RequestError | null>(null);

    const runRef = useRef(run);
    runRef.current = run;

    const inFlight = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const mutate = useCallback((input: I, handlers?: { onSuccess?: (result: T) => void }) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setError(null);

        void (async () => {
            try {
                const result = await runRef.current(input);
                if (mounted.current) handlers?.onSuccess?.(result);
            } catch (err) {
                if (mounted.current) setError(asRequestError(err));
            } finally {
                inFlight.current = false;
                if (mounted.current) setPending(false);
            }
        })();
    }, []);

    const reset = useCallback(() => setError(null), []);

    return { mutate, pending, error, reset };
}
