/**
 * The doctor's half of "the doctor is finished", from the notification shade:
 * while someone is in the chair, the doctor's phone carries an ongoing notice
 * with a Finish action, and the action works with the app in the background.
 *
 * It rides the same foreground service as the desk's listener — without it the
 * tap would reach a process Android has already cut off the network. Finish is
 * `appointment.awaitPayment`, the same write as the button on the day screen:
 * no payment, the patient goes to the desk. One tap is one write — the service
 * drops the button the moment it is tapped, a visit already on its way is not
 * sent twice, and the server's conditional UPDATE refuses a second one anyway.
 * A refusal because the visit had already left the chair is not a failure; any
 * other is reported, and the button comes back.
 *
 * The service runs all day, not only while someone is in the chair: with the
 * chair empty it shows a quiet "Listening for patients" instead, and the socket
 * it keeps up is what carries `useArrivalNotices` to a phone in the background.
 * It can only be started from the foreground, so it comes up when the app is
 * opened; in the background it is only redrawn.
 */
import { type ClientRole, localizeCopy } from '@lustre/shared';
// biome-ignore lint/style/noRestrictedImports: runs the Android foreground service and subscribes to its action, `/ws` changes and `AppState` — all outside React
import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
    type ListenerNotice,
    onListenerAction,
    startListening,
    stopListening,
    updateListening,
} from '../../modules/lustre-listener';
import { onServerChange, useDemoMode } from '../api';
import { getLocale } from '../i18n/runtime';
import { asRequestError } from '../screens/day/data/client';
import { checkInTimes, api as dayApi } from '../screens/day/data/day';
import type { Appointment } from '../screens/day/data/types';
import { todayKey } from '../screens/day/time';
import {
    dismissFinishFailure,
    ensurePermission,
    notificationsAllowed,
    presentFinishFailure,
} from './notifications';
import { chairToFinish, finishFailure, firstName } from './visitAction';

function noticeFor(chair: Appointment): ListenerNotice {
    const t = (copy: string, vars?: Record<string, string>) => localizeCopy(getLocale(), copy, vars);
    return {
        title: t('{name} is in the chair', { name: firstName(chair.patient.name) }),
        body: t('Finish the visit to send them to the desk.'),
        channelName: t('Staying connected to the clinic'),
        publicTitle: t('A visit is in progress'),
        action: { label: t('Finish visit'), id: chair.id, pendingBody: t('Finishing the visit…') },
    };
}

function idleNotice(): ListenerNotice {
    const t = (copy: string) => localizeCopy(getLocale(), copy);
    return {
        title: t('Listening for patients'),
        body: t('You will be told when a patient checks in.'),
        channelName: t('Staying connected to the clinic'),
    };
}

async function readChair(): Promise<Appointment | null> {
    const day = await dayApi.byDate(todayKey());
    const checkedIn = day.filter((row) => row.status === 'checked_in').map((row) => row.id);
    const arrivals = checkedIn.length > 0 ? await checkInTimes(checkedIn) : null;
    return chairToFinish(day, arrivals?.checkedInAt);
}

/** `role` is null until the stored role has been read, so a desk phone never shows it for a frame. */
export function useVisitFinishAction(role: ClientRole | null): void {
    // Demo mode has no clinic to finish a visit on in the background.
    const { enabled: demo } = useDemoMode();

    useEffect(() => {
        if (role !== 'doctor' || demo) return;
        let active = true;
        let generation = 0;
        let shown: Appointment | null = null;
        const finishing = new Set<string>();

        const show = (notice: ListenerNotice): boolean =>
            AppState.currentState === 'active' ? startListening(notice) : updateListening(notice);

        const draw = (chair: Appointment) => {
            shown = show(noticeFor(chair)) ? chair : null;
        };

        const refresh = async () => {
            const mine = ++generation;
            if (!(await notificationsAllowed())) {
                if (!active || mine !== generation) return;
                shown = null;
                stopListening();
                return;
            }
            let chair: Appointment | null;
            try {
                chair = await readChair();
            } catch {
                // Unreachable: leave the notice as it is rather than take
                // down the one way to finish from the shade. With nothing up
                // yet, bring the service up anyway, so the socket it keeps
                // alive can reconnect and still hear a check-in.
                if (active && mine === generation && shown === null) show(idleNotice());
                return;
            }
            if (!active || mine !== generation) return;
            if (chair && finishing.has(chair.id)) return;
            if (chair) {
                draw(chair);
            } else {
                // The chair is empty, but the service stays: it is what keeps
                // a check-in reaching this phone in the background.
                shown = null;
                show(idleNotice());
            }
        };

        const finish = async (id: string) => {
            if (finishing.has(id)) return;
            finishing.add(id);
            try {
                await dayApi.awaitPayment(id);
                void dismissFinishFailure(id).catch(() => undefined);
            } catch (err) {
                const failure = finishFailure(asRequestError(err));
                if (failure !== 'gone') {
                    // The service took the button away on the tap; put it back
                    // now rather than after a refetch that may fail the same way.
                    // Only while that visit is still the one shown: a refresh
                    // may have moved the notice on, and redrawing the old
                    // visit would put a stale Finish back over the new one.
                    const current = shown;
                    if (active && current?.id === id) draw(current);
                    void presentFinishFailure(id, failure === 'offline').catch(() => undefined);
                }
            } finally {
                finishing.delete(id);
            }
            if (active) await refresh();
        };

        void ensurePermission().then(() => {
            if (active) void refresh();
        });
        const foreground = AppState.addEventListener('change', (state) => {
            if (state === 'active') void refresh();
        });
        const changes = onServerChange((areas) => {
            if (areas === 'all' || areas.has('appointment') || areas.has('visit')) void refresh();
        });
        const taps = onListenerAction((id) => void finish(id));

        return () => {
            active = false;
            foreground.remove();
            changes();
            taps();
            stopListening();
        };
    }, [role, demo]);
}
