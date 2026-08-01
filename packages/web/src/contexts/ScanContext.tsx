import type { PatientDetail } from '@mawid/shared';
import { useNavigate } from '@tanstack/react-router';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { useServerEvent } from './SocketContext.tsx';

/**
 * Scan-follow: a printed slip is scanned on a phone, `/s/:ref` records it and
 * emits `scan`, and the desk screen jumps to that patient (spec §9). Paper
 * becomes a remote control for the system.
 *
 * The exception is a desk that is mid-edit. Navigating away from a half-typed
 * booking would throw the form away, so opening the sheet calls `beginEdit()`
 * and closing it calls `endEdit()` — both from the handlers that already run on
 * those clicks — and a scan arriving in between waits in a banner instead.
 */

export interface HeldScan {
    appointmentId: number;
    patientId: number;
    /** Resolved after the fact — the `scan` payload carries ids only. */
    name: string | null;
}

interface ScanValue {
    held: HeldScan | null;
    open: () => void;
    dismiss: () => void;
    /** Suppress auto-follow while un-saved input is on screen. */
    beginEdit: () => void;
    endEdit: () => void;
}

const ScanContext = createContext<ScanValue | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const [held, setHeld] = useState<HeldScan | null>(null);

    /*
     * A ref, not state: nothing renders differently because the desk is mid-edit,
     * and it is only ever read inside the `scan` handler. A counter rather than a
     * boolean, so two overlapping editors cannot release each other's hold.
     */
    const edits = useRef(0);

    const goTo = useCallback(
        (patientId: number) => {
            void navigate({ to: '/p/$patientId', params: { patientId } });
        },
        [navigate],
    );

    useServerEvent('scan', (payload) => {
        if (edits.current === 0) {
            goTo(payload.patientId);
            return;
        }

        setHeld({ ...payload, name: null });

        // One extra request, only on a held scan: the banner is far more useful
        // naming the patient than saying "someone scanned something".
        api.get<PatientDetail>(`/api/patients/${payload.patientId}`)
            .then((detail) => {
                setHeld((current) =>
                    current?.patientId === payload.patientId
                        ? { ...current, name: detail.patient.name }
                        : current,
                );
            })
            .catch(() => {
                // Leave the banner nameless rather than dropping the scan.
            });
    });

    const open = useCallback(() => {
        if (!held) return;
        /*
         * Opening a held scan navigates away, which unmounts whatever was being
         * edited without its close handler ever running. Clearing the count here
         * is what stops that leaking into a desk that silently never
         * auto-follows again.
         */
        edits.current = 0;
        goTo(held.patientId);
        setHeld(null);
    }, [held, goTo]);

    const dismiss = useCallback(() => setHeld(null), []);
    const beginEdit = useCallback(() => {
        edits.current += 1;
    }, []);
    const endEdit = useCallback(() => {
        edits.current = Math.max(0, edits.current - 1);
    }, []);

    const value = useMemo<ScanValue>(
        () => ({ held, open, dismiss, beginEdit, endEdit }),
        [held, open, dismiss, beginEdit, endEdit],
    );

    return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanValue {
    const value = useContext(ScanContext);
    if (!value) throw new Error('useScan must be used inside <ScanProvider>');
    return value;
}
