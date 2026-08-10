import type { ClinicDay } from './data/types';
import { clockToMinutes, weekdayOf } from './time';

/**
 * Opening and closing hours. One module, on purpose.
 *
 * Nothing else in the cluster may assume a clinic hour: the timeline's bounds,
 * the calendar's load bars, the walk-in sheet's default time and the "closed"
 * verdict all come from here. When the clinic's real schedule replaces the
 * defaults below, that is a change to `DEFAULTS` and nothing else.
 *
 * MAW-1 has since landed `clinic_days` and `settings.schedule`, so the server
 * is the source when it has one. `DEFAULTS` is what a clinic that has never
 * opened the settings screen gets — an empty schedule means "not configured",
 * not "closed every day of the week", and a day view that renders seven closed
 * days on a fresh install is a bug report, not a schedule.
 */

export interface DayHours {
    /** Minutes since midnight. */
    opens: number;
    closes: number;
}

/**
 * The guess, and the only one in the cluster. Egyptian clinics keep evening
 * hours and close on Friday; both are assumptions, both are here, and both are
 * overridden the moment the clinic saves a schedule.
 */
const DEFAULTS: Readonly<Record<number, DayHours | null>> = {
    0: { opens: 10 * 60, closes: 22 * 60 }, // Sunday
    1: { opens: 10 * 60, closes: 22 * 60 },
    2: { opens: 10 * 60, closes: 22 * 60 },
    3: { opens: 10 * 60, closes: 22 * 60 },
    4: { opens: 10 * 60, closes: 22 * 60 },
    5: null, // Friday — closed
    6: { opens: 10 * 60, closes: 22 * 60 }, // Saturday
};

/**
 * The hours for a day, or `null` when the clinic is closed.
 *
 * `schedule` is `settings.schedule`: one row per open weekday, no row meaning
 * closed. `undefined` is "not loaded yet"; an empty array is "never
 * configured". Both fall back to the defaults, because a timeline drawn against
 * nothing is worse than one drawn against a guess.
 */
export function hoursFor(dateKey: string, schedule: readonly ClinicDay[] | undefined): DayHours | null {
    const weekday = weekdayOf(dateKey);

    if (schedule !== undefined && schedule.length > 0) {
        const day = schedule.find((row) => row.weekday === weekday);
        return day ? { opens: clockToMinutes(day.opensAt), closes: clockToMinutes(day.closesAt) } : null;
    }

    return DEFAULTS[weekday] ?? null;
}

export function isClosed(dateKey: string, schedule: readonly ClinicDay[] | undefined): boolean {
    return hoursFor(dateKey, schedule) === null;
}

/** Minutes the clinic is open that day — the denominator of the load bar. */
export function openMinutes(dateKey: string, schedule: readonly ClinicDay[] | undefined): number {
    const hours = hoursFor(dateKey, schedule);
    return hours ? hours.closes - hours.opens : 0;
}

/**
 * The bounds the timeline actually draws, given what is booked.
 *
 * Booking outside opening hours is the secretary's call and the server does not
 * stop her, so an appointment before the clinic opens has to be *on* the
 * timeline. The grid grows to hold it rather than clipping it out of sight.
 */
export function timelineBounds(
    dateKey: string,
    schedule: readonly ClinicDay[] | undefined,
    booked: readonly { startMinutes: number; endMinutes: number }[],
): DayHours {
    const hours = hoursFor(dateKey, schedule);
    let opens = hours?.opens ?? 9 * 60;
    let closes = hours?.closes ?? 18 * 60;

    for (const slot of booked) {
        opens = Math.min(opens, slot.startMinutes);
        closes = Math.max(closes, slot.endMinutes);
    }

    // Round out to the hour so the ruler starts and ends on a labelled line.
    return { opens: Math.floor(opens / 60) * 60, closes: Math.ceil(closes / 60) * 60 };
}
