/**
 * The doctor's "a patient has checked in": an `appointment:checked_in` on `/ws`
 * becomes a notification on the doctor's phone, foreground or not.
 *
 * The mirror of `useVisitCompletedNotices`. The event carries the appointment's
 * ID and nothing else (§13), so the name is asked for through tRPC. The socket
 * stays up in the background because `useVisitFinishAction` keeps the doctor's
 * foreground service running all day, not only while someone is in the chair.
 */
import type { ClientRole } from '@lustre/shared';
// biome-ignore lint/style/noRestrictedImports: subscribes to the `/ws` event stream, outside React
import { useEffect } from 'react';
import { onServerEvent, trpcClient, useDemoMode } from '../api';
import { presentArrivalNotice } from './notifications';
import { arrivalToAnnounce } from './visitNotice';

/** `stillWanted` is asked after the name comes back: the role can change while it is on its way. */
async function announce(appointmentId: string, stillWanted: () => boolean): Promise<void> {
    const name = await trpcClient.appointment.byId.query({ id: appointmentId }).then(
        (appointment) => appointment.patient.name,
        () => null,
    );
    if (stillWanted()) await presentArrivalNotice(appointmentId, name);
}

/** `role` is null until the stored role has been read, so a desk phone never subscribes for a frame. */
export function useArrivalNotices(role: ClientRole | null): void {
    // Demo mode has no socket, and no desk phone to check anyone in.
    const { enabled: demo } = useDemoMode();

    useEffect(() => {
        if (role !== 'doctor' || demo) return;
        let active = true;
        const unsubscribe = onServerEvent((event) => {
            const appointmentId = arrivalToAnnounce(event, role, Date.now());
            if (appointmentId) void announce(appointmentId, () => active).catch(() => undefined);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [role, demo]);
}
