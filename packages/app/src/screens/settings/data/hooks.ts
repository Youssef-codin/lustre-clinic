import { ERROR_CODE } from '@mawid/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './_LocalApi';

/**
 * The two hooks every settings screen is built out of.
 *
 * TanStack Query is what these become — it is the choice in SPEC §2 and it
 * arrives with the tRPC client (F2). Until then this is the smallest thing that
 * gives a screen the three states it is not allowed to skip: a list has loading
 * and error, a mutation has pending. There is no cache and no invalidation; a
 * write reloads the query it affected by calling `reload`, which is what
 * `invalidateQueries` will do for free later. See BLOCKED.md.
 */

export interface QueryResult<T> {
    data: T | undefined;
    /** True on the first load only. A reload keeps the stale rows on screen. */
    loading: boolean;
    reloading: boolean;
    error: Error | null;
    reload: () => void;
}

/**
 * `load` is called on mount and on every `reload`. It is captured in a ref
 * rather than listed as a dependency: a screen writing it inline would
 * otherwise refetch on every render, and every settings screen writes it inline.
 */
export function useQuery<T>(load: () => Promise<T>): QueryResult<T> {
    const [data, setData] = useState<T>();
    const [error, setError] = useState<Error | null>(null);
    const [pending, setPending] = useState(true);

    const loadRef = useRef(load);
    loadRef.current = load;

    // The one place a fetch is started, so the one place an effect is needed.
    const generation = useRef(0);

    const run = useCallback(() => {
        generation.current += 1;
        const generationAtStart = generation.current;
        setPending(true);
        setError(null);

        loadRef
            .current()
            .then((result) => {
                // A reload that started later has already answered; this one is
                // stale and its rows would flicker the newer ones away.
                if (generation.current !== generationAtStart) return;
                setData(result);
                setPending(false);
            })
            .catch((err: unknown) => {
                if (generation.current !== generationAtStart) return;
                setError(asError(err));
                setPending(false);
            });
    }, []);

    useEffect(() => {
        run();
        // A screen that unmounts mid-flight invalidates the response rather
        // than setting state on a component that is gone.
        return () => {
            generation.current += 1;
        };
    }, [run]);

    return {
        data,
        loading: pending && data === undefined,
        reloading: pending && data !== undefined,
        error,
        reload: run,
    };
}

export interface MutationResult<TInput, TOutput> {
    /** Resolves to the result, or to `undefined` when the write failed. */
    run: (input: TInput) => Promise<TOutput | undefined>;
    pending: boolean;
    error: Error | null;
    reset: () => void;
}

/**
 * A single write, with the pending state the buttons need. `run` never rejects
 * — a settings screen has nowhere to put an unhandled rejection, and every
 * caller wants the same thing: keep the editor open and show `error`.
 */
export function useMutation<TInput, TOutput>(
    write: (input: TInput) => Promise<TOutput>,
): MutationResult<TInput, TOutput> {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const writeRef = useRef(write);
    writeRef.current = write;

    const run = useCallback(async (input: TInput) => {
        setPending(true);
        setError(null);
        try {
            return await writeRef.current(input);
        } catch (err: unknown) {
            setError(asError(err));
            return undefined;
        } finally {
            setPending(false);
        }
    }, []);

    const reset = useCallback(() => setError(null), []);

    return { run, pending, error, reset };
}

function asError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

/**
 * English for a failure. The client localizes from `ERROR_CODE` and never from
 * the server's message text (SPEC §4, §14) — this is that switch, in the one
 * language the app has until the localization scaffold (F4) lands with the
 * dictionaries. See BLOCKED.md.
 */
export function errorMessage(error: Error | null): string | undefined {
    if (!error) return undefined;
    if (!(error instanceof ApiError)) return "Something went wrong. It wasn't saved.";

    switch (error.code) {
        case ERROR_CODE.NOT_FOUND:
            return 'That has been removed. Go back and try again.';
        case ERROR_CODE.DUPLICATE_KEY:
            return 'A question already uses that key. Pick another.';
        case ERROR_CODE.VALIDATION:
            return 'Check the fields and try again.';
        case ERROR_CODE.PROCEDURE_NESTING_TOO_DEEP:
            return 'A category cannot go inside another category.';
        case ERROR_CODE.DB_UNAVAILABLE:
            return "Couldn't reach the clinic computer.";
        default:
            return "Something went wrong. It wasn't saved.";
    }
}
