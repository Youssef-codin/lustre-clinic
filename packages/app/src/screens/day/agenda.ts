/**
 * The day split by status, not by the clock: a booked slot whose time has
 * passed and nobody checked in is still a decision to make, so it stays in the
 * open list rather than folding behind. Only the three settled statuses go
 * behind the fold. The patient in the chair is drawn once at the top and is
 * excluded from the split via `activeId`.
 */
import type { AppointmentStatus } from '@lustre/shared';
import type { Appointment } from './data/types';

const SETTLED: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>(['done', 'cancelled', 'no_show']);

export function isSettled(appointment: Appointment): boolean {
    return SETTLED.has(appointment.status);
}

/**
 * The row's one-line summary of the planned work. A booking may plan several
 * procedures (§7), and the name comes down with the appointment, so no lookup
 * against the catalogue is needed. Undefined when nothing was planned, which is
 * what the row treats as "no label".
 */
export function procedureLabel(appointment: Appointment): string | undefined {
    if (appointment.procedures.length === 0) return undefined;
    return appointment.procedures.map((row) => row.name).join(' · ');
}

export interface DaySplit {
    past: Appointment[];
    upcoming: Appointment[];
}

/**
 * `fold` is what "before this" means: the fold is relative to now, so only
 * today has one. On any other date every row is settled, and folding them all
 * away left the day view drawing nothing at all — the fold is only rendered on
 * today, so the rows went behind a section that was never on screen while the
 * tab pill went on counting them.
 */
export function splitDay(
    appointments: readonly Appointment[],
    activeId: string | null,
    fold = true,
): DaySplit {
    const byTime = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const rest = activeId === null ? byTime : byTime.filter((row) => row.id !== activeId);

    if (!fold) return { past: [], upcoming: rest };

    return {
        past: rest.filter(isSettled),
        upcoming: rest.filter((row) => !isSettled(row)),
    };
}
