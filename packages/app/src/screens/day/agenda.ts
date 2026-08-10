import type { AppointmentStatus } from '@mawid/shared';
import type { Appointment } from './data/types';

/**
 * The day, split the way `day-view-schedule.html` draws it: what is behind the
 * clinic, who is in the chair, and what is still to come.
 *
 * The split is by *status*, not by the clock. A booked slot whose time has
 * passed and which nobody checked in is not history — it is a patient who has
 * not turned up, and somebody has to mark it. Folding it into a collapsed
 * "before this" section would hide the one row on the screen that needs a
 * decision. Only the three settled statuses go behind the fold.
 */

const SETTLED: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>(['done', 'cancelled', 'no_show']);

export function isSettled(appointment: Appointment): boolean {
    return SETTLED.has(appointment.status);
}

export interface DaySplit {
    /** Done, cancelled, no-show — collapsed by default. */
    past: Appointment[];
    /** Everything still live, earliest first. The chair is not in here. */
    upcoming: Appointment[];
}

/**
 * `activeId` is whoever the chair card is about. They are drawn once, at the
 * top, and must not appear again three rows down.
 */
export function splitDay(appointments: readonly Appointment[], activeId: string | null): DaySplit {
    const byTime = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const rest = activeId === null ? byTime : byTime.filter((row) => row.id !== activeId);

    return {
        past: rest.filter(isSettled),
        upcoming: rest.filter((row) => !isSettled(row)),
    };
}
