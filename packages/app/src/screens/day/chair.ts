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
 * `slotProgress` measures the slot, never the patient, and is left uncapped
 * once the slot runs over.
 */
import type { AppointmentStatus } from '@lustre/shared';
import type { Appointment } from './data/types';
import { dateKey, formatSpan, minutesOfDay } from './time';

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
 * How far into the visit the clock is.
 *
 * It runs from when the patient was actually seen, which is `checkedInAt` when
 * they arrived early: seating someone at 11:00 for an 11:30 slot means the
 * visit started at 11:00, and a bar that sat at zero until 11:30 was telling
 * the doctor he had not started something he was already doing.
 *
 * The end does not move with it. The slot still finishes when it was booked to,
 * so arriving early lengthens the visit rather than shifting it — twenty booked
 * minutes seen half an hour early are fifty minutes of room, and the overrun
 * warning holds off accordingly. Arriving late is not the mirror of this: a
 * patient seated after their slot opened keeps the slot's own start, or every
 * late arrival would silently be granted a fresh full slot and nothing would
 * ever read as running over.
 */
export function slotProgress(
    appointment: Appointment,
    nowMinutes: number,
    checkedInAt?: string,
): SlotProgress {
    const booked = minutesOfDay(appointment.startsAt);
    const ends = booked + appointment.durationMinutes;
    const start = checkedInAt ? Math.min(minutesOfDay(checkedInAt), booked) : booked;

    const elapsed = nowMinutes - start;
    const duration = ends - start;
    const over = elapsed - duration;

    return {
        value: duration > 0 ? elapsed / duration : 0,
        over: over > 0,
        label: over > 0 ? overLabel(over) : `${Math.max(elapsed, 0)} / ${duration} min`,
        window: formatSpan(minutesOfDay(appointment.startsAt), ends),
    };
}

function overLabel(over: number): string {
    return over < 60 ? `${over} min over` : `${Math.floor(over / 60)}h ${over % 60}m over`;
}
