import type { DayAppointments, IsoDate } from '@mawid/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';

export interface DayAppointmentsResource {
    appointments: DayAppointments | null;
    error: unknown;
    loading: boolean;
    reload: () => void;
}

/** `GET /api/appointments?date=` — the day view's rows, patient embedded. */
export function useDayAppointments(date: IsoDate): DayAppointmentsResource {
    const [appointments, setAppointments] = useState<DayAppointments | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);

    // Only the newest request may write. The date arrows can be clicked faster
    // than the responses come back, and the last one clicked must win.
    const latest = useRef(0);

    const reload = useCallback(() => {
        const requestId = latest.current + 1;
        latest.current = requestId;
        setLoading(true);

        api.get<DayAppointments>(`/api/appointments?date=${date}`)
            .then((rows) => {
                if (latest.current !== requestId) return;
                setAppointments(rows);
                setError(null);
            })
            .catch((err: unknown) => {
                if (latest.current !== requestId) return;
                setAppointments(null);
                setError(err);
            })
            .finally(() => {
                if (latest.current === requestId) setLoading(false);
            });
    }, [date]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { appointments, error, loading, reload };
}
