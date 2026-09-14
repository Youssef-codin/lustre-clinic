/**
 * The words and colours for an appointment's status, without the markup, so the
 * choice can be tested under `bun test`, which has no React Native.
 *
 * `checked_in` means arrived, not seated: the patient in the chair and everyone
 * queued behind them all carry it. The status alone cannot say which, so the
 * caller passes `inChair`, read off the arrival queue (`screens/day/chair.ts`),
 * the same way the day view reads it. Only the queue's head is In the chair, and
 * everyone behind them is Waiting.
 *
 * Leaving `inChair` out keeps the old wording for callers that have no queue
 * to hand.
 */
import type { AppointmentStatus } from '@lustre/shared';

export type StatusTone = 'muted' | 'accent' | 'due' | 'success';

const LABEL: Record<AppointmentStatus, string> = {
    booked: 'Booked',
    checked_in: 'In the chair',
    awaiting_payment: 'At the desk',
    done: 'Done',
    cancelled: 'Cancelled',
    no_show: 'No-show',
};

const TONE = {
    booked: 'muted',
    checked_in: 'accent',
    awaiting_payment: 'due',
    done: 'success',
    cancelled: 'muted',
    no_show: 'due',
} as const satisfies Record<AppointmentStatus, StatusTone>;

function waiting(status: AppointmentStatus, inChair: boolean | undefined): boolean {
    return status === 'checked_in' && inChair === false;
}

export function statusLabel(status: AppointmentStatus, inChair?: boolean): string {
    return waiting(status, inChair) ? 'Waiting' : LABEL[status];
}

/** The pill's colour without the pill, for rows that only have room for a word. */
export function statusTone(status: AppointmentStatus, inChair?: boolean): StatusTone {
    return waiting(status, inChair) ? 'due' : TONE[status];
}
