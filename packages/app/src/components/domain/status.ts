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
 * Leaving `inChair` out says Checked in: arrived, and nothing claimed about the
 * chair. The offline schedule and a past day have no queue to read.
 *
 * Every screen takes its words from here. They used to live in four places and
 * drifted: the sheet said Done where the patient's history said Came for the
 * same visit, and the desk chip said At desk beside a pill saying At the desk.
 * `statusCopy` is the English key, for a component that localizes through
 * `useT` and so re-renders when the language changes.
 */
import { type AppointmentStatus, localizeCopy } from '@lustre/shared';
import { getLocale } from '../../i18n/runtime';

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

export function statusCopy(status: AppointmentStatus, inChair?: boolean): string {
    if (status !== 'checked_in') return LABEL[status];
    if (inChair === undefined) return 'Checked in';
    return inChair ? LABEL.checked_in : 'Waiting';
}

export function statusLabel(status: AppointmentStatus, inChair?: boolean): string {
    return localizeCopy(getLocale(), statusCopy(status, inChair));
}

/** The pill's colour without the pill, for rows that only have room for a word. */
export function statusTone(status: AppointmentStatus, inChair?: boolean): StatusTone {
    return waiting(status, inChair) ? 'due' : TONE[status];
}

/**
 * The badge's colour — the patient record's, which every row badge now shares.
 * Quieter than the pill's: a row is read down a list, and only what needs
 * acting on (owed, waiting, missed) is coloured.
 */
export type BadgeTone = 'ink' | 'success' | 'due' | 'muted';

const BADGE = {
    booked: 'muted',
    checked_in: 'due',
    awaiting_payment: 'ink',
    done: 'success',
    cancelled: 'muted',
    no_show: 'due',
} as const satisfies Record<AppointmentStatus, BadgeTone>;

/** The chair, and a `checked_in` row with no queue to read, are ink; only the queue behind it is due. */
export function badgeTone(status: AppointmentStatus, inChair?: boolean): BadgeTone {
    return status === 'checked_in' && inChair !== false ? 'ink' : BADGE[status];
}
