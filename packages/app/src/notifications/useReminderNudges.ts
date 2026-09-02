/**
 * Keeps the daily nudge armed against what the server currently says. The
 * settings pane has written `reminder_notify_at` and `reminder_repeat_minutes`
 * since the cluster came off fixtures; this is the thing that finally reads them.
 *
 * One arm path, and everything else feeds it — the effect below is the only
 * caller of `armNudges`. A second path is how a phone ends up with two series
 * layered over each other, each buzzing on its own half-hour.
 *
 * The effect is the one place an effect is right: arming an OS alarm is a side
 * effect on a thing outside React, off state React owns, and there is nothing to
 * derive.
 *
 * **Foreground is the important trigger**, and it feeds the effect twice over.
 * It invalidates the two queries, because a phone that was asleep heard nothing
 * about what the other phone did. It also bumps a counter *in the effect's
 * dependencies*, because three of the arm's inputs are not in those answers at
 * all — whether the OS still refuses notifications, what the wall clock says,
 * and which day it is. Invalidation alone would leave the nudge unarmed for a
 * user who turned notifications on in Android settings and came back, and for a
 * process that was alive at midnight.
 */

import { offsetForDate, todayKey } from '@lustre/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api, useTRPC } from '../api';
import { armNudges } from './notifications';
import { minutesOfClock, planNudges } from './schedule';

export function useReminderNudges(): void {
    const trpc = useTRPC();
    const rearm = useRearmReminderNudges();

    // Foregrounding has to re-run the arm itself, not only ask for fresh data.
    // Three of the inputs are not in the query answers at all: whether the OS
    // still refuses notifications, what the wall clock says, and which day it
    // is. A refetch that comes back identical moves no dependency, and the two
    // states that follow from that are exactly the ones the design names — a
    // user who denied the prompt, turned notifications on in Android settings
    // and came back, and a process that was alive at midnight and needs the new
    // day's series.
    const [foregrounded, setForegrounded] = useState(0);

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

    // biome-ignore lint/correctness/useExhaustiveDependencies: `foregrounded` is a trigger, not a value — the arm reads the clock, the day and the OS permission, none of which React can see change
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
    }, [notifyAt, repeatMinutes, dismissedOn, pendingCount, foregrounded]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            rearm();
            setForegrounded((n) => n + 1);
        });
        return () => subscription.remove();
    }, [rearm]);
}

/**
 * Re-read what the nudge is armed against. For the actions that change the list
 * from inside this app — a reminder marked sent or skipped, a day dismissed —
 * which go over the raw tRPC client and so leave the query cache untouched.
 *
 * Stable across renders, because the effect above holds it in a dependency list:
 * a fresh identity every render would tear down and re-add the `AppState`
 * listener on every one of them.
 */
export function useRearmReminderNudges(): () => void {
    const client = useQueryClient();

    return useCallback(() => {
        void client.invalidateQueries(api.reminder.pathFilter());
        void client.invalidateQueries(api.settings.pathFilter());
    }, [client]);
}
