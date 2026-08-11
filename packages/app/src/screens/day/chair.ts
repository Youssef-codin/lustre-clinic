/**
 * The doctor's day. The domain has no `in_chair` — `checked_in` covers both —
 * so the chair is whoever checked in first (`checkedInAt`, falling back to
 * `updatedAt` when the visit is not to hand) and the rest wait. The black card
 * goes to whoever is next; the chair keeps the strip, and nobody is drawn in
 * both places. `awaiting_payment` counts as settled — the doctor's part ends
 * when the patient goes out to pay. `slotProgress` measures the slot, never
 * the patient, and is left uncapped once the slot runs over.
 */
import type { AppointmentStatus } from '@mawid/shared';
import type { Appointment } from './data/types';
import { formatTime, minutesOfDay, minutesToClock } from './time';

const SETTLED: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>([
    'done',
    'cancelled',
    'no_show',
    'awaiting_payment',
]);

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
    const arrivedAt = (row: Appointment) => checkedInAt.get(row.id) ?? row.updatedAt;

    const queue = appointments
        .filter((row) => row.status === 'checked_in')
        .sort((a, b) => arrivedAt(a).localeCompare(arrivedAt(b)));

    const chair = queue[0] ?? null;
    const waiting = queue.slice(1);

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

export function slotProgress(appointment: Appointment, nowMinutes: number): SlotProgress {
    const start = minutesOfDay(appointment.startsAt);
    const elapsed = nowMinutes - start;
    const duration = appointment.durationMinutes;
    const over = elapsed - duration;

    return {
        value: duration > 0 ? elapsed / duration : 0,
        over: over > 0,
        label: over > 0 ? overLabel(over) : `${Math.max(elapsed, 0)} / ${duration} min`,
        window: `${formatTime(appointment.startsAt)} – ${minutesToClock(start + duration)}`,
    };
}

function overLabel(over: number): string {
    return over < 60 ? `${over} min over` : `${Math.floor(over / 60)}h ${over % 60}m over`;
}
