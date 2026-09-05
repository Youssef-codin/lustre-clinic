/**
 * Who is in the chair. `checked_in` means arrived, not seated — the desk checks
 * people in as they come and they queue, so the chair is whoever arrived first
 * (`checkedInAt`, falling back to `updatedAt` when the visit is not to hand)
 * and the rest wait. Nothing promotes the next patient: the chair leaves the
 * queue the moment they go to `awaiting_payment` or `done`, and the next
 * arrival is the chair by the same rule. Both screens read the queue from here
 * so they cannot disagree about who is seated.
 *
 * The two days differ only in what they count as over. The doctor is finished
 * when the patient goes out to pay, so `awaiting_payment` is settled for him;
 * the desk is not finished until the money is in, so it holds the black card.
 * `slotProgress` measures the booked slot, never the patient — arrival time
 * does not touch it — and is left uncapped once the slot runs over.
 */
import type { AppointmentStatus } from '@lustre/shared';
import type { Appointment } from './data/types';
import { dateKey, formatDuration, formatProgress, formatSpan, minutesOfDay } from './time';

const SETTLED: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>([
    'done',
    'cancelled',
    'no_show',
    'awaiting_payment',
]);

export interface Queue {
    chair: Appointment | null;
    waiting: Appointment[];
}

/**
 * Where the patient stands. `finished` is the odd one out — they are not in the
 * clinic at all: the visit is closed, or has been reopened to be corrected,
 * which is a different thing from one that is still running.
 */
export type Standing = 'waiting' | 'chair' | 'desk' | 'finished';

/**
 * Where a patient stands when the queue is out of view — a visit opened from a
 * patient's record rather than from the day.
 *
 * The date has to be read with the status. `awaiting_payment` means standing at
 * the desk *today*; on a day gone by it means a visit that was sent to the desk
 * and never settled, and nobody is standing anywhere. Reading the status alone
 * put a patient from three weeks ago at the desk waiting to pay.
 */
export function standingFor(appointment: Appointment, today: string): Standing {
    if (appointment.status === 'done') return 'finished';
    // `dateKey`, not the ISO string's first ten characters: the day a late
    // appointment falls on is the local one, and the wire carries UTC.
    if (dateKey(new Date(appointment.startsAt)) !== today) return 'finished';
    return appointment.status === 'awaiting_payment' ? 'desk' : 'chair';
}

/**
 * The arrival queue: everyone checked in, earliest arrival first. The head is
 * in the chair, the tail is the waiting room.
 */
export function arrivalQueue(
    appointments: readonly Appointment[],
    checkedInAt: ReadonlyMap<string, string> = new Map(),
): Queue {
    const arrivedAt = (row: Appointment) => checkedInAt.get(row.id) ?? row.updatedAt;

    const queue = appointments
        .filter((row) => row.status === 'checked_in')
        .sort((a, b) => arrivedAt(a).localeCompare(arrivedAt(b)));

    return { chair: queue[0] ?? null, waiting: queue.slice(1) };
}

export interface DeskDay extends Queue {
    /** The black card. Money owed outranks the chair — the desk's job is to collect it. */
    card: Appointment | null;
    desk: Appointment | null;
    next: Appointment | null;
}

export function splitDeskDay(
    appointments: readonly Appointment[],
    checkedInAt: ReadonlyMap<string, string> = new Map(),
): DeskDay {
    const { chair, waiting } = arrivalQueue(appointments, checkedInAt);

    const desk =
        appointments
            .filter((row) => row.status === 'awaiting_payment')
            .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0] ?? null;

    const next =
        appointments
            .filter((row) => row.status === 'booked')
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;

    return { chair, waiting, desk, next, card: desk ?? chair ?? next };
}

export interface DoctorDay {
    chair: Appointment | null;
    waiting: Appointment[];
    headline: Appointment | null;
    strip: Appointment | null;
    list: Appointment[];
    past: Appointment[];
}

export function splitDoctorDay(
    appointments: readonly Appointment[],
    checkedInAt: ReadonlyMap<string, string> = new Map(),
): DoctorDay {
    const { chair, waiting } = arrivalQueue(appointments, checkedInAt);

    const booked = appointments
        .filter((row) => row.status === 'booked')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    const headline = waiting[0] ?? booked[0] ?? chair;
    const strip = chair && chair !== headline ? chair : null;
    const drawn = new Set([headline?.id, strip?.id]);

    return {
        chair,
        waiting,
        headline,
        strip,
        list: [...waiting, ...booked].filter((row) => !drawn.has(row.id)),
        past: appointments
            .filter((row) => SETTLED.has(row.status))
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    };
}

export interface SlotProgress {
    value: number;
    over: boolean;
    label: string;
    window: string;
}

/**
 * How far into the booked slot the clock is.
 *
 * The denominator is the booked duration and nothing else: a 30-minute
 * appointment is 30 minutes of bar however early the patient walked in, which
 * is what the desk means when it books one. The bar does not start running
 * until the slot opens, so an early arrival sits at zero rather than at some
 * fraction of a slot that grew to meet them.
 *
 * This reverses the earlier rule, which ran the clock from `checkedInAt` and
 * left the end where it was booked, so that arriving early lengthened the
 * visit. That held for someone twenty minutes early and fell apart at a desk
 * that checks people in as they walk through the door: a noon consultation
 * checked in at 08:47 read `0 / 223 min`.
 *
 * What the old rule was reaching for — the doctor should not be told he has not
 * started something he is already doing — needs a record of when the patient
 * went into the chair, and there is none. `checked_in` means arrived, not
 * seated. Until that timestamp exists the bar draws the slot, which it can
 * name, rather than the visit, which it cannot.
 */
export function slotProgress(appointment: Appointment, nowMinutes: number): SlotProgress {
    const booked = minutesOfDay(appointment.startsAt);
    const duration = appointment.durationMinutes;
    const ends = booked + duration;

    const elapsed = Math.max(nowMinutes - booked, 0);
    const over = elapsed - duration;

    return {
        value: duration > 0 ? elapsed / duration : 0,
        over: over > 0,
        label: over > 0 ? `${formatDuration(over)} over` : formatProgress(elapsed, duration),
        window: formatSpan(booked, ends),
    };
}
