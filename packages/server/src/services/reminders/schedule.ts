import type { IsoInstant, TimeRange, WorkingHours } from '@mawid/shared';
import type { Config } from '../../config/index.ts';
import { clinicDate, clinicTimeToInstant, type Interval, workingIntervals } from '../../util/time.ts';

/**
 * When a reminder should go out.
 *
 * `starts_at - hoursBefore`, then **snapped backwards to the nearest moment the
 * clinic is open**. That snap is the rule that keeps everything else simple:
 * without it, a Monday 10am appointment schedules its reminder for Sunday
 * afternoon when the clinic is shut and the PC is off, so it does not send and
 * arrives late Monday instead. Snapped backwards it goes out Saturday
 * afternoon, while someone is there. See spec §9.
 *
 * Get this right and the catch-up path becomes a rare exception rather than a
 * weekly event.
 */

/** How far back to look for an open window before giving up. */
const MAX_LOOKBACK_DAYS = 14;

/**
 * When the clinic is both open *and* inside the send window — the intersection,
 * because a reminder must satisfy both. An empty list means closed that day.
 */
export function sendableIntervals(
    date: string,
    hours: WorkingHours,
    sendWindow: TimeRange,
    timezone: string,
): Interval[] {
    const windowStart = clinicTimeToInstant(date, sendWindow.from, timezone);
    const windowEnd = clinicTimeToInstant(date, sendWindow.to, timezone);

    return workingIntervals(date, hours, timezone)
        .map((open) => ({
            start: new Date(Math.max(open.start.getTime(), windowStart.getTime())),
            end: new Date(Math.min(open.end.getTime(), windowEnd.getTime())),
        }))
        .filter((i) => i.start < i.end);
}

/**
 * The latest sendable moment at or before `instant`.
 *
 * Returns `instant` untouched when it already falls inside an open window.
 * Otherwise it walks back a day at a time to the end of the previous window —
 * never forwards, because a reminder that arrives after its appointment is
 * worse than one that arrives early.
 */
export function snapBackToOpen(instant: Date, config: Config): Date {
    const { hours, clinic } = config;
    const { sendWindow } = config.reminders;

    for (let back = 0; back <= MAX_LOOKBACK_DAYS; back += 1) {
        const probe = new Date(instant.getTime() - back * 86_400_000);
        const intervals = sendableIntervals(
            clinicDate(probe, clinic.timezone),
            hours,
            sendWindow,
            clinic.timezone,
        );

        // Latest first: the nearest open moment at or before `instant`.
        for (const interval of [...intervals].reverse()) {
            if (back === 0 && probe >= interval.start && probe < interval.end) return probe;
            if (interval.end <= instant) return new Date(interval.end.getTime() - 60_000);
        }
    }

    /*
     * A clinic with no open hours in the fortnight before the appointment. The
     * reminder is scheduled at its unsnapped time rather than dropped — the
     * tick's skip rules will decide, and a row that exists is visible on the
     * desk while one that does not is silent.
     */
    return instant;
}

export function reminderTimeFor(startsAt: IsoInstant, config: Config): IsoInstant {
    const natural = new Date(Date.parse(startsAt) - config.reminders.hoursBefore * 3_600_000);
    return snapBackToOpen(natural, config).toISOString();
}

/** Whether `instant` is inside the configured send window on its own clinic day. */
export function withinSendWindow(instant: Date, config: Config): boolean {
    const { clinic, reminders } = config;
    const date = clinicDate(instant, clinic.timezone);

    return (
        instant >= clinicTimeToInstant(date, reminders.sendWindow.from, clinic.timezone) &&
        instant < clinicTimeToInstant(date, reminders.sendWindow.to, clinic.timezone)
    );
}
