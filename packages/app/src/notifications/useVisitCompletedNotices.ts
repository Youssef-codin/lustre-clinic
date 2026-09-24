/**
 * The desk's half of "the doctor is finished": a `visit:completed` on `/ws`
 * becomes a notification on the secretary's phone, foreground or not.
 *
 * The event carries the appointment's ID and nothing else (§13), so the name
 * the notice shows is asked for through tRPC, the same way every screen asks.
 * One completion is one notice: the server announces the transition once, the
 * cursor in `api/serverEvents.ts` drops a replayed frame it has already
 * applied, and the OS replaces a notice posted twice under one identifier.
 *
 * "Foreground or not" needs the foreground service in `modules/lustre-listener`:
 * Android cuts a backgrounded app's network within seconds, socket and all. It
 * runs on the desk phone only, and only while notices can be shown at all. It
 * can only be started from the foreground, so every return to the app asks for
 * it again — which is also how turning notifications on in Android settings
 * takes effect.
 */
import { type ClientRole, localizeCopy } from '@lustre/shared';
// biome-ignore lint/style/noRestrictedImports: subscribes to the `/ws` event stream and `AppState`, and runs the Android foreground service — all outside React
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { startListening, stopListening } from '../../modules/lustre-listener';
import { onServerEvent, serverNow, trpcClient, useDemoMode } from '../api';
import { getLocale } from '../i18n/runtime';
import { ensurePermission, notificationsAllowed, presentVisitNotice } from './notifications';
import { completionToAnnounce } from './visitNotice';

async function announce(appointmentId: string): Promise<void> {
    const name = await trpcClient.appointment.byId.query({ id: appointmentId }).then(
        (appointment) => appointment.patient.name,
        () => null,
    );
    await presentVisitNotice(appointmentId, name);
}

function listen(): void {
    const t = (copy: string) => localizeCopy(getLocale(), copy);
    startListening({
        title: t('Listening for the doctor'),
        body: t('You will be told when a patient is coming to the desk.'),
        channelName: t('Staying connected to the clinic'),
    });
}

/** `role` is null until the stored role has been read, so a doctor's phone never subscribes for a frame. */
export function useVisitCompletedNotices(role: ClientRole | null): void {
    // Demo mode has no socket to keep alive, and no other phone to finish a visit.
    const { enabled: demo } = useDemoMode();

    useEffect(() => {
        if (role !== 'secretary' || demo) return;
        let active = true;

        void ensurePermission().then((granted) => {
            if (active && granted) listen();
        });
        const foreground = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            void notificationsAllowed().then((granted) => {
                if (active && granted) listen();
            });
        });
        const unsubscribe = onServerEvent((event) => {
            const appointmentId = completionToAnnounce(event, role, serverNow());
            if (appointmentId) void announce(appointmentId).catch(() => undefined);
        });

        return () => {
            active = false;
            foreground.remove();
            unsubscribe();
            stopListening();
        };
    }, [role, demo]);
}
