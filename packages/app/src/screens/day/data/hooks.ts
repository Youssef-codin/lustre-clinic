/**
 * `_LocalQuery` / `_LocalMutation` — BLOCKED.md. TanStack Query is Phase 1 F2
 * and is not a dependency yet; this is the part of it the day view uses. It is
 * deliberately not a cache, a deduper, or a background refetcher — adding those
 * would build a second query library the real one has to be reconciled with.
 * `key` is what identifies a request (change it and the query runs again);
 * `run` lives in a ref so an inline arrow never refetches — the key is the
 * only thing that does. A slow answer for yesterday landing after the tap that
 * moved to today is guarded by an attempt counter, and data is cleared on key
 * change rather than on error, so a *failed refresh* still keeps the day on
 * screen behind its stale-data banner. Every mutation crosses Tailscale, so
 * `pending` is what stops the second tap becoming a second appointment, and
 * errors are held rather than thrown so a failed write ends up on screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { asRequestError, type RequestError } from './client';

export type QueryStatus = 'loading' | 'success' | 'error';

export interface QueryResult<T> {
    data: T | undefined;
    status: QueryStatus;
    error: RequestError | null;
    refreshing: boolean;
    refetch: () => void;
}

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

    const attempt = useRef(0);

    const load = useCallback(async (isRefresh: boolean) => {
        attempt.current += 1;
        const current = attempt.current;
        if (isRefresh) {
            setRefreshing(true);
        } else {
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

/**
 * `onError` runs in addition to the held `error`, never instead of it: the
 * failure still lands on screen, and this is only for the recovery that has to
 * happen with it — re-reading the times a refused booking has just proved stale.
 */
export interface MutationHandlers<T> {
    onSuccess?: (result: T) => void;
    onError?: (error: RequestError) => void;
}

export interface MutationResult<I, T> {
    mutate: (input: I, handlers?: MutationHandlers<T>) => void;
    pending: boolean;
    error: RequestError | null;
    reset: () => void;
}

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

    const mutate = useCallback((input: I, handlers?: MutationHandlers<T>) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setError(null);

        void (async () => {
            try {
                const result = await runRef.current(input);
                if (mounted.current) handlers?.onSuccess?.(result);
            } catch (err) {
                if (!mounted.current) return;
                const failure = asRequestError(err);
                setError(failure);
                handlers?.onError?.(failure);
            } finally {
                inFlight.current = false;
                if (mounted.current) setPending(false);
            }
        })();
    }, []);

    const reset = useCallback(() => setError(null), []);

    return { mutate, pending, error, reset };
}
