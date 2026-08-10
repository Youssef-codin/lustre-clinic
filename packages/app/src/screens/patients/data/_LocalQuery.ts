import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `_Local` per §10: the two hooks TanStack Query would give us. It is not in
 * the app's dependencies yet (SPEC §18 F2), and adding it means editing
 * `package.json` and the lockfile in four worktrees at once. Noted in
 * `BLOCKED.md`; the call sites are shaped like TanStack's so the swap is
 * mechanical.
 *
 * What is deliberately here, because the screens depend on it:
 *
 * - **Every list has loading and error.** `loading` is true on the first run
 *   and on a refetch, `error` survives until the next success, and `refetch`
 *   is what an error state's Retry calls.
 * - **A stale answer never lands.** The clinic server is reached over
 *   Tailscale, and a search is retyped faster than it answers. Each run takes a
 *   sequence number and only the newest may set state, so the results of a
 *   query the user has already moved past cannot overwrite the current ones.
 * - **Nothing sets state after unmount.**
 *
 * What is deliberately not here: a cache, retries, invalidation, background
 * refetch. Those are TanStack's job and guessing at them now would only make
 * the swap harder.
 */

export interface QueryResult<T> {
    data: T | undefined;
    error: Error | undefined;
    /** True while a run is in flight, including a refetch over existing data. */
    loading: boolean;
    refetch: () => void;
}

/**
 * `deps` is the query key: the run restarts when it changes, exactly as a
 * TanStack key would. `run` is re-read on every render, so it does not need to
 * be stable.
 */
export function useQuery<T>(run: () => Promise<T>, deps: readonly unknown[]): QueryResult<T> {
    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<Error | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);

    const latest = useRef(run);
    latest.current = run;

    // Only the newest run may write. An older one resolving late is dropped.
    const sequence = useRef(0);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    /*
     * `attempt` is the whole of how `refetch` works: bumping it is what re-runs
     * the effect, so it is deliberately in the dependency list and deliberately
     * not read in the body. `run` is held in a ref so an inline arrow at the
     * call site does not re-run this on every render, and `deps` is the query
     * key, spread the way a TanStack key would be passed.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the refetch trigger
    useEffect(() => {
        const ticket = ++sequence.current;
        setLoading(true);

        latest
            .current()
            .then((result) => {
                if (!mounted.current || ticket !== sequence.current) return;
                setData(result);
                setError(undefined);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (!mounted.current || ticket !== sequence.current) return;
                setError(asError(err));
                setLoading(false);
            });
        // `run` is held in a ref; `deps` is the key. attempt drives refetch.
    }, [attempt, ...deps]);

    const refetch = useCallback(() => setAttempt((n) => n + 1), []);

    return { data, error, loading, refetch };
}

export interface MutationResult<TInput, TOutput> {
    mutate: (input: TInput) => Promise<TOutput | undefined>;
    /** The pending state every write on this cluster is required to show. */
    pending: boolean;
    error: Error | undefined;
    reset: () => void;
}

/**
 * A write. `mutate` resolves to `undefined` when it failed, so a caller can
 * close a sheet on success without needing a try/catch — the error is on the
 * result and the screen renders it.
 *
 * Overlapping calls are refused rather than queued: the write is a save button,
 * and two of them in flight is the double-tap the pending state exists to stop.
 */
export function useMutation<TInput, TOutput>(
    run: (input: TInput) => Promise<TOutput>,
): MutationResult<TInput, TOutput> {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<Error | undefined>(undefined);

    const inFlight = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const latest = useRef(run);
    latest.current = run;

    const mutate = useCallback(async (input: TInput) => {
        if (inFlight.current) return undefined;
        inFlight.current = true;
        setPending(true);
        setError(undefined);

        try {
            const result = await latest.current(input);
            return result;
        } catch (err: unknown) {
            if (mounted.current) setError(asError(err));
            return undefined;
        } finally {
            inFlight.current = false;
            if (mounted.current) setPending(false);
        }
    }, []);

    const reset = useCallback(() => setError(undefined), []);

    return { mutate, pending, error, reset };
}

function asError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}
