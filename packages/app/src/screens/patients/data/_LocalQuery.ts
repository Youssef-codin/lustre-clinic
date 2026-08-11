// `_Local` per §10: the two hooks TanStack Query would give us, with call sites
// shaped like TanStack's so the swap is mechanical. Guarantees the screens
// depend on: every list has loading/error/refetch; a stale answer never lands —
// each run takes a sequence number and only the newest may set state, because a
// search is retyped faster than Tailscale answers; nothing sets state after
// unmount. Deliberately absent: cache, retries, invalidation, background
// refetch — those are TanStack's job. `deps` is the query key; `run` is held in
// a ref so an inline arrow does not re-run the effect. A failed mutation
// resolves to `undefined` so a caller can close on success, and overlapping
// mutations are refused rather than queued.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryResult<T> {
    data: T | undefined;
    error: Error | undefined;
    loading: boolean;
    refetch: () => void;
}

export function useQuery<T>(run: () => Promise<T>, deps: readonly unknown[]): QueryResult<T> {
    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<Error | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);

    const latest = useRef(run);
    latest.current = run;

    const sequence = useRef(0);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

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
    }, [attempt, ...deps]);

    const refetch = useCallback(() => setAttempt((n) => n + 1), []);

    return { data, error, loading, refetch };
}

export interface MutationResult<TInput, TOutput> {
    mutate: (input: TInput) => Promise<TOutput | undefined>;
    pending: boolean;
    error: Error | undefined;
    reset: () => void;
}

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
