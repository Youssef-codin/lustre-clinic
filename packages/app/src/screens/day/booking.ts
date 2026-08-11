/**
 * The times a booking may start on a given day. The server is the authority —
 * double-booking is a Postgres exclusion constraint and only it can settle a
 * race — but a grid that offers a slot already gone is how a secretary tells a
 * patient on the phone they are booked and then finds they are not, so the
 * taken times are drawn from the day already fetched and offered as taken.
 * Cancelled and no-show rows hold no slot (`holdsSlot`), so a cancellation
 * frees its time here the moment the day is refetched.
 *
 * Slots step every `SLOT_STEP` minutes rather than every duration, because the
 * clinic's durations are 15/30/45 and a 45-minute visit still starts on the
 * quarter hour. A slot whose visit would run past closing is offered rather
 * than hidden — clinics do overrun, and the sheet says so instead of losing the
 * only time left. Everything here is minutes-from-midnight, local time, the
 * same currency `hours.ts` and the timeline use.
 */
import type { Appointment, ClinicDay } from './data/types';
import { hoursFor } from './hours';
import { holdsSlot } from './month';
import { minutesOfDay } from './time';

export const SLOT_STEP = 15;

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
    durationMinutes: number;
    /** Minutes into today, or null when the day being booked is not today. */
    nowMinutes: number | null;
}

export function slotsFor({
    dateKey,
    schedule,
    appointments,
    durationMinutes,
    nowMinutes,
}: SlotsInput): Slot[] {
    const hours = hoursFor(dateKey, schedule);
    if (!hours) return [];

    const busy = appointments.filter(holdsSlot).map((row) => {
        const start = minutesOfDay(row.startsAt);
        return { start, end: start + row.durationMinutes };
    });

    const slots: Slot[] = [];
    for (let minutes = hours.opens; minutes < hours.closes; minutes += SLOT_STEP) {
        const end = minutes + durationMinutes;
        const taken = busy.some((row) => minutes < row.end && row.start < end);
        const past = nowMinutes !== null && minutes < nowMinutes;

        slots.push({
            minutes,
            state: taken ? 'taken' : past ? 'past' : 'free',
            runsLate: end > hours.closes,
        });
    }

    return slots;
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
