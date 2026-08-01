import type { PatientSearchResponse } from '@mawid/shared';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';

/** The search endpoint is capped rather than paginated, so it is safe to call
 *  it per keystroke — but not on every one of them. */
const DEBOUNCE_MS = 220;

export interface PatientSearchResource {
    results: PatientSearchResponse;
    error: unknown;
    searching: boolean;
}

export function usePatientSearch(query: string): PatientSearchResource {
    const [results, setResults] = useState<PatientSearchResponse>([]);
    const [error, setError] = useState<unknown>(null);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            setError(null);
            setSearching(false);
            return;
        }

        let cancelled = false;
        setSearching(true);

        const timer = setTimeout(() => {
            api.get<PatientSearchResponse>(`/api/patients?q=${encodeURIComponent(trimmed)}`)
                .then((rows) => {
                    if (cancelled) return;
                    setResults(rows);
                    setError(null);
                })
                .catch((err: unknown) => {
                    if (cancelled) return;
                    setResults([]);
                    setError(err);
                })
                .finally(() => {
                    if (!cancelled) setSearching(false);
                });
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query]);

    return { results, error, searching };
}
