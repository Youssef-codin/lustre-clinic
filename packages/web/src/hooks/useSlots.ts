import type { IsoDate, SlotsResponse } from '@mawid/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';

export interface SlotsResource {
    slots: SlotsResponse | null;
    error: unknown;
    loading: boolean;
    reload: () => void;
}

/**
 * `GET /api/slots?date=&typeId=` — both are required, because a 20-minute
 * checkup and a 90-minute root canal see different gaps in the same day.
 */
export function useSlots(date: IsoDate, typeId: string | null): SlotsResource {
    const [slots, setSlots] = useState<SlotsResponse | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);

    // See the note in useDayAppointments — changing the type re-queries, and
    // the select can be changed faster than the answers arrive.
    const latest = useRef(0);

    const reload = useCallback(() => {
        const requestId = latest.current + 1;
        latest.current = requestId;

        if (!typeId) {
            setSlots(null);
            setLoading(false);
            return;
        }

        setLoading(true);

        api.get<SlotsResponse>(`/api/slots?date=${date}&typeId=${encodeURIComponent(typeId)}`)
            .then((response) => {
                if (latest.current !== requestId) return;
                setSlots(response);
                setError(null);
            })
            .catch((err: unknown) => {
                if (latest.current !== requestId) return;
                setSlots(null);
                setError(err);
            })
            .finally(() => {
                if (latest.current === requestId) setLoading(false);
            });
    }, [date, typeId]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { slots, error, loading, reload };
}
