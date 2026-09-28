/**
 * What the ringing alarm asks the clinic server just before it rings, so it
 * never rings about a list the other phone has already cleared. It rings with
 * no JS running, so the requests are written out here, at arm time, and
 * `modules/lustre-alarm` only sends them and reads two fields back.
 *
 * No `expo-notifications` and no `react-native` in here, like `schedule.ts`:
 * this is the part worth testing.
 */
import { TRPC_ENDPOINT } from '@lustre/shared';
import type { AlarmCheck } from '../../modules/lustre-alarm';

export type AlarmCheckInput = {
    /** Demo mode has no server, and its invented list must not be checked against the real one. */
    demo: boolean;
    current: string | null;
    lan: string | null;
    tailscale: string | null;
    today: string;
    offsetMinutes: number;
};

/** Null when there is nowhere to ask; the alarm then rings as armed. */
export function alarmCheck(input: AlarmCheckInput): AlarmCheck | null {
    if (input.demo) return null;

    const bases = [...new Set([input.current, input.lan, input.tailscale].filter((base) => base !== null))];
    if (bases.length === 0) return null;

    // It rings only if `reminder.pending` returns a row and `settings.get`'s
    // `reminderDismissedOn` is not `today`: the day view's badge, cut to one
    // row. The row is counted and dropped, never kept or logged.
    // `throughToday` because every ring is at or after the notify time, where
    // the badge already counts the rest of the day; asking for it outright keeps
    // a server clock a few seconds behind the phone from silencing the first ring.
    const pending = { dueOnly: true, limit: 1, offsetMinutes: input.offsetMinutes, throughToday: true };

    return {
        bases,
        pendingPath: `${TRPC_ENDPOINT}/reminder.pending?input=${encodeURIComponent(JSON.stringify(pending))}`,
        settingsPath: `${TRPC_ENDPOINT}/settings.get`,
        today: input.today,
    };
}
