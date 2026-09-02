/**
 * When the daily reminder nudge fires. SPEC §11 and `PRODUCT.md:96`: at
 * `reminder_notify_at`, if reminders are still pending, buzz; repeat every
 * `reminder_repeat_minutes` until the list is cleared or dismissed; stop
 * overnight.
 *
 * No `expo-notifications` and no `react-native` in here — this is the rule, and
 * the rule is what is worth testing. `notifications.ts` takes the instants this
 * returns and hands them to the platform.
 *
 * **Overnight is midnight.** The series runs from the notify time to the end of
 * that calendar day and stops. A nudge at 02:00 about a list nobody can act on
 * until the clinic opens is the thing the setting exists to prevent.
 *
 * **Today only.** The pending count is only known as of the last time the app
 * was open, so tomorrow's series is not scheduled: a nudge about a day-old list
 * is a nudge about nothing. The re-arm on foreground is what covers the real
 * case, because the day view is opened every clinic morning.
 *
 * **`dismissedOn` is the stop.** `reminder_dismissed_on` already exists and
 * `reminder.dismissToday` already sets it; this is the thing that consults it.
 * It is per calendar day, so tomorrow arms again on its own.
 */

/** Android tolerates far more, but a 06:00 start repeating every 15 minutes is 72 alarms for one fact. */
const MAX_NUDGES = 24;

const DAY_MINUTES = 24 * 60;

export type NudgePlan = {
    /** Local instants to fire at, soonest first. Empty means: cancel everything and arm nothing. */
    at: Date[];
    /** Why the plan is empty, for the log line and for the settings pane to read back. */
    silent: 'pending' | 'none-pending' | 'dismissed' | 'past-midnight' | null;
};

export type NudgeInput = {
    /** Minutes past midnight — `reminder_notify_at` parsed. */
    notifyAt: number;
    /** `reminder_repeat_minutes`. */
    repeatMinutes: number;
    /** How many reminders `reminder.pending` returned. Zero arms nothing. */
    pendingCount: number;
    /** `reminder_dismissed_on`, a `YYYY-MM-DD` or null. */
    dismissedOn: string | null;
    /** The local day being planned, as `YYYY-MM-DD`. */
    today: string;
    now: Date;
};

export function planNudges(input: NudgeInput): NudgePlan {
    const { notifyAt, repeatMinutes, pendingCount, dismissedOn, today, now } = input;

    if (pendingCount <= 0) return { at: [], silent: 'none-pending' };
    if (dismissedOn === today) return { at: [], silent: 'dismissed' };

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const step = Math.max(1, Math.trunc(repeatMinutes));

    const at: Date[] = [];
    for (let minutes = notifyAt; minutes < DAY_MINUTES && at.length < MAX_NUDGES; minutes += step) {
        // Strictly future: a nudge for a minute that has already passed fires
        // the instant it is scheduled, which on a mid-afternoon foreground would
        // buzz once for every slot since the notify time.
        if (minutes <= nowMinutes) continue;
        at.push(atMinute(now, minutes));
    }

    if (at.length === 0) return { at: [], silent: 'past-midnight' };
    return { at, silent: 'pending' };
}

/**
 * `HH:MM` — what `settings.reminderNotifyAt` returns — as minutes past midnight.
 *
 * Clamped rather than trusted. The column is a Postgres `time` and the schema
 * validates it, but this value decides when an OS alarm fires: `NaN` minutes
 * would arm nothing at all and do it silently, and a wrapped one would fire in
 * the small hours, which is the single thing the overnight rule forbids. A
 * default of midnight is at least visibly wrong.
 */
export function minutesOfClock(clock: string): number {
    const [hours = 0, minutes = 0] = clock.split(':').map(Number);
    const total = hours * 60 + minutes;
    if (!Number.isFinite(total)) return 0;
    return Math.min(DAY_MINUTES - 1, Math.max(0, Math.trunc(total)));
}

function atMinute(day: Date, minutes: number): Date {
    const at = new Date(day);
    at.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return at;
}
