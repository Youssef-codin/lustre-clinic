/**
 * The two hooks every settings screen is built out of — stand-ins for TanStack
 * Query, so there is no cache or invalidation yet: a write calls `reload`,
 * what `invalidateQueries` will do for free later. `load` is captured in a
 * ref, not listed as a dependency, or a screen writing it inline would refetch
 * on every render; a generation counter drops stale responses and invalidates
 * on unmount. `run` never rejects — errors surface via `error` so the editor
 * stays open. Messages localize from `ERROR_CODE`, never the server's text.
 */
import { ERROR_CODE } from '@mawid/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './_LocalApi';

export interface QueryResult<T> {
    data: T | undefined;
    loading: boolean;
    reloading: boolean;
    error: Error | null;
    reload: () => void;
}

export function useQuery<T>(load: () => Promise<T>): QueryResult<T> {
    const [data, setData] = useState<T>();
    const [error, setError] = useState<Error | null>(null);
    const [pending, setPending] = useState(true);

    const loadRef = useRef(load);
    loadRef.current = load;

    const generation = useRef(0);

    const run = useCallback(() => {
        generation.current += 1;
        const generationAtStart = generation.current;
        setPending(true);
        setError(null);

        loadRef
            .current()
            .then((result) => {
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
    run: (input: TInput) => Promise<TOutput | undefined>;
    pending: boolean;
    error: Error | null;
    reset: () => void;
}

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
