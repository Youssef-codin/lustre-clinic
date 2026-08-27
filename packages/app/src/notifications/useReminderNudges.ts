/**
 * Keeps the daily nudge armed against what the server currently says. The
 * settings pane has written `reminder_notify_at` and `reminder_repeat_minutes`
 * since the cluster came off fixtures; this is the thing that finally reads them.
 *
 * One arm path, and everything else feeds it. The effect below arms whenever the
 * inputs change, and every trigger — a foreground, a reminder marked sent, a day
 * dismissed — works by invalidating the two queries so those inputs change. A
 * second path that armed directly is how a phone ends up with two series layered
 * over each other.
 *
 * The effect is the one place an effect is right: arming an OS alarm is a side
 * effect on a thing outside React, off state React owns, and there is nothing to
 * derive.
 *
 * **Foreground is the important trigger.** The list can only move through this
 * app or the other phone, and a backgrounded phone hears about the other phone
 * over `/ws` — but a phone that was asleep hears nothing, so coming back is when
 * what is armed is most likely to be wrong.
 */

import { offsetForDate, todayKey } from '@lustre/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api, useTRPC } from '../api';
import { armNudges } from './notifications';
import { minutesOfClock, planNudges } from './schedule';

export function useReminderNudges(): void {
    const trpc = useTRPC();
    const rearm = useRearmReminderNudges();

    const settings = useQuery(trpc.settings.get.queryOptions());
    const pending = useQuery(
        trpc.reminder.pending.queryOptions({
            dueOnly: true,
            limit: 100,
            offsetMinutes: offsetForDate(todayKey()),
        }),
    );

    const notifyAt = settings.data?.reminderNotifyAt;
    const repeatMinutes = settings.data?.reminderRepeatMinutes;
    const dismissedOn = settings.data?.reminderDismissedOn ?? null;
    const pendingCount = pending.data?.length;

    useEffect(() => {
        // Nothing is armed and nothing is cancelled until both answers are in.
        // Disarming on a missing answer would silence the nudge every time the
        // clinic PC is briefly unreachable, which is when it matters most.
        if (notifyAt === undefined || repeatMinutes === undefined || pendingCount === undefined) {
            return;
        }

        const now = new Date();

        void armNudges(
            planNudges({
                notifyAt: minutesOfClock(notifyAt),
                repeatMinutes,
                pendingCount,
                dismissedOn,
                today: todayKey(now),
                now,
            }),
        );
    }, [notifyAt, repeatMinutes, dismissedOn, pendingCount]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') rearm();
        });
        return () => subscription.remove();
    }, [rearm]);
}

/**
 * Re-read what the nudge is armed against. For the actions that change the list
 * from inside this app — a reminder marked sent or skipped, a day dismissed —
 * which go over the raw tRPC client and so leave the query cache untouched.
 */
export function useRearmReminderNudges(): () => void {
    const client = useQueryClient();

    return () => {
        void client.invalidateQueries(api.reminder.pathFilter());
        void client.invalidateQueries(api.settings.pathFilter());
    };
}
