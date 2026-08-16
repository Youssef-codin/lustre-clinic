/**
 * The times a booking may start on a given day. The server is the authority —
 * double-booking is a Postgres exclusion constraint and only it can settle a
 * race — but a grid that offers a slot already gone is how a secretary tells a
 * patient on the phone they are booked and then finds they are not, so the
 * taken times are drawn from the day already fetched and offered as taken.
 * Cancelled and no-show rows hold no slot (`holdsSlot`), so a cancellation
 * frees its time here the moment the day is refetched.
 *
 * Slots step by the length of the visit being booked, from opening — a fixed
 * quarter-hour step was written when the clinic's lengths were 15/30/45, and it
 * survived them becoming 10/20/30/45: a 20-minute visit cannot start at 10:20
 * on a quarter-hour grid, so choosing a different length changed which of the
 * same times were free and never which times were offered. Stepping by the
 * duration tiles the day, and asking for a longer visit visibly thins the grid.
 *
 * Only the tiling. Offering the moment each existing booking ends would squeeze
 * a start into every gap, but a desk does not say "five fifty-three" to anyone
 * — the times have to be times a person would agree to out loud, and a clean
 * grid is worth more than the odd recovered quarter of an hour.
 *
 * Nothing is offered past closing either. A day that overruns is real, but it
 * is not something the desk *books*: it is handled by the day running late and
 * every later time sliding with it (`delay.ts`), which is a projection over the
 * booked day, not a slot anyone chose. A slot that starts before closing and
 * ends after is still offered — clinics do overrun — and says so.
 *
 * Everything here is minutes-from-midnight, local time, the same currency
 * `hours.ts` and the timeline use.
 */
import type { Appointment, ClinicDay } from './data/types';
import { hoursFor } from './hours';
import { holdsSlot } from './month';
import { minutesOfDay } from './time';

/** No grid finer than this, however short the visit — five-minute chips are a wall. */
export const MIN_SLOT_STEP = 5;

export type SlotState = 'free' | 'taken' | 'past';

export interface Slot {
    minutes: number;
    state: SlotState;
    /** The visit would end after the clinic closes. Bookable, but said out loud. */
    runsLate: boolean;
}

export interface SlotsInput {
    dateKey: string;
    schedule: readonly ClinicDay[] | undefined;
    /** The day's rows, already scoped to the branch being booked into. */
    appointments: readonly Appointment[];
    /** The branch being booked into — whose hours the grid is drawn from. */
    branchId: string | null;
    durationMinutes: number;
    /** Minutes into today, or null when the day being booked is not today. */
    nowMinutes: number | null;
}

export function slotsFor({
    dateKey,
    schedule,
    appointments,
    branchId,
    durationMinutes,
    nowMinutes,
}: SlotsInput): Slot[] {
    const hours = hoursFor(dateKey, schedule, branchId);
    if (!hours) return [];

    const busy = appointments.filter(holdsSlot).map((row) => {
        const start = minutesOfDay(row.startsAt);
        return { start, end: start + row.durationMinutes };
    });

    const step = Math.max(durationMinutes, MIN_SLOT_STEP);

    const starts: number[] = [];
    for (let minutes = hours.opens; minutes < hours.closes; minutes += step) {
        starts.push(minutes);
    }

    return starts.map((minutes) => {
        const end = minutes + durationMinutes;
        const taken = busy.some((row) => minutes < row.end && row.start < end);
        const past = nowMinutes !== null && minutes < nowMinutes;

        return {
            minutes,
            state: taken ? 'taken' : past ? 'past' : 'free',
            runsLate: end > hours.closes,
        };
    });
}

/** The time the sheet opens on: the first one that can actually be booked. */
export function firstFreeSlot(slots: readonly Slot[]): number | null {
    return slots.find((slot) => slot.state === 'free')?.minutes ?? null;
}

/** Whether a time the user already picked survived a change of day or length. */
export function slotIsFree(slots: readonly Slot[], minutes: number | null): boolean {
    if (minutes === null) return false;
    return slots.some((slot) => slot.minutes === minutes && slot.state === 'free');
}
