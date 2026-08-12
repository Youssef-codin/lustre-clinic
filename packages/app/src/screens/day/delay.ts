/**
 * How late the day is running, and what every booked time means because of it.
 *
 * A clinic day slips for two reasons and they are not the same reason. The
 * patient in the chair stays longer than the slot allowed for — that is time
 * already spent, measured against the clock. And someone walks in and is taken
 * — that is time about to be spent, which nobody's booked slot ever accounted
 * for. Both push everyone after them along, so both are counted here and the
 * split is kept, because "the chair is 12 minutes over" and "there are two
 * walk-ins ahead of you" are different sentences to say to a waiting patient.
 *
 * Nothing here writes. `startsAt` stays the time the patient was told on the
 * phone — rewriting thirty rows because the chair overran is a lie the moment
 * the day catches up, and the day usually does. The projection is drawn beside
 * the booked time, never instead of it, and unwinds by itself as the chair
 * empties. A booked patient who is already waiting adds nothing: they own a
 * slot further down the day, so counting them would count that time twice.
 *
 * The delay is rounded up to `MIN_SLOT_STEP`, so every projection lands on the
 * same grid the booking grid tiles by. "6:17" is a false precision — the chair
 * does not empty to the minute, and a column of 6:17 / 6:47 / 7:07 is harder to
 * read than 6:20 / 7:50 / 7:10 while claiming to know more. Rounding the delay
 * once rather than each row keeps the day in its booked order and evenly
 * spaced; rounding *up* keeps it honest, because a time promised early is the
 * one that gets the desk in trouble.
 *
 * Minutes-from-midnight, local time, the same currency as `booking.ts` and
 * `hours.ts`.
 */

import { isSettled } from './agenda';
import { MIN_SLOT_STEP } from './booking';
import { arrivalQueue } from './chair';
import type { Appointment } from './data/types';
import { minutesOfDay } from './time';

export interface DayDelay {
    /** How far behind the day is, to the slot: everything booked slides by this. */
    minutes: number;
    /** What the patient in the chair has overrun their slot by, to the minute. */
    fromChair: number;
    /** The walk-ins taken ahead of the booked day, to the minute. */
    fromWalkIns: number;
    walkIns: number;
}

export const ON_TIME: DayDelay = { minutes: 0, fromChair: 0, fromWalkIns: 0, walkIns: 0 };

/**
 * `checkedInAt` is the same map the chair reads, so both agree on who is
 * seated. `nowMinutes` is null on any day that is not today: a day the clock
 * has not reached cannot be running late, and one already gone is not still
 * slipping.
 */
export function dayDelay(
    appointments: readonly Appointment[],
    nowMinutes: number | null,
    checkedInAt: ReadonlyMap<string, string> = new Map(),
): DayDelay {
    if (nowMinutes === null) return ON_TIME;

    const { chair, waiting } = arrivalQueue(appointments, checkedInAt);

    const fromChair = chair
        ? Math.max(0, nowMinutes - (minutesOfDay(chair.startsAt) + chair.durationMinutes))
        : 0;

    // Only walk-ins. A booked patient waiting their turn is already in the day.
    const walkingIn = waiting.filter((row) => row.channel === 'walk_in');
    const fromWalkIns = walkingIn.reduce((total, row) => total + row.durationMinutes, 0);

    return {
        minutes: toSlot(fromChair + fromWalkIns),
        fromChair,
        fromWalkIns,
        walkIns: walkingIn.length,
    };
}

/**
 * When a booking is realistically going to start. A settled row is history and
 * does not move; a time that has already gone by cannot be projected into the
 * past, so it is held at now — the honest answer for the patient whose 3:00 it
 * is at 3:20 is "you are next", not "3:00".
 */
export function projectedStart(appointment: Appointment, delay: DayDelay, nowMinutes: number | null): number {
    const booked = minutesOfDay(appointment.startsAt);
    if (delay.minutes === 0 || isSettled(appointment)) return booked;

    const projected = booked + delay.minutes;
    return nowMinutes === null ? projected : Math.max(projected, toSlot(nowMinutes));
}

/** Up to the next slot boundary. Never down: an early promise is the costly one. */
function toSlot(minutes: number): number {
    return Math.ceil(minutes / MIN_SLOT_STEP) * MIN_SLOT_STEP;
}

/** Whether a row is worth drawing a projection on at all. */
export function isProjected(appointment: Appointment, delay: DayDelay): boolean {
    return delay.minutes > 0 && !isSettled(appointment) && appointment.status === 'booked';
}

/** "20 min late", "1h 5m late" — the day's headline, or null when it is on time. */
export function delayLabel(delay: DayDelay): string | null {
    if (delay.minutes <= 0) return null;
    if (delay.minutes < 60) return `${delay.minutes} min late`;
    return `${Math.floor(delay.minutes / 60)}h ${delay.minutes % 60}m late`;
}

/** Why the day is late, in the words the desk would use to explain it. */
export function delayReason(delay: DayDelay): string | null {
    const parts: string[] = [];
    if (delay.fromChair > 0) parts.push(`the chair is ${delay.fromChair} min over`);
    if (delay.walkIns > 0) {
        parts.push(`${delay.walkIns} walk-in${delay.walkIns === 1 ? '' : 's'} ahead`);
    }
    return parts.length === 0 ? null : parts.join(', ');
}
