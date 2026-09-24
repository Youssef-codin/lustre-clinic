/**
 * The rules behind the doctor's Finish action on the ongoing notification. Pure,
 * so they are tested without `expo-notifications` or the native service.
 */
import { ERROR_CODE, type ErrorCode } from '@lustre/shared';
import { arrivalQueue } from '../screens/day/chair';
import type { Appointment } from '../screens/day/data/types';
import { busiestBranch, holdsSlot } from '../screens/day/month';

/**
 * The visit the action finishes: whoever is in the chair today, read the way
 * the doctor's day screen reads it — on the branch holding most of the day,
 * falling back to any branch with someone in its chair.
 */
export function chairToFinish(
    day: readonly Appointment[],
    checkedInAt: ReadonlyMap<string, string> = new Map(),
): Appointment | null {
    const branches = [...new Set(day.map((row) => row.branchId))];
    const busiest = busiestBranch(day.filter(holdsSlot), null);
    if (busiest) {
        branches.sort((a, b) => Number(b === busiest) - Number(a === busiest));
    }

    for (const branch of branches) {
        const { chair } = arrivalQueue(
            day.filter((row) => row.branchId === branch),
            checkedInAt,
        );
        if (chair) return chair;
    }
    return null;
}

/**
 * All of the patient the notice shows. It sits in the shade of a phone left on
 * a desk, so it names the patient only as far as the doctor needs to be sure
 * which visit the button ends.
 */
export function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * What a failed finish means. `gone` is not a failure to report: the visit left
 * the chair some other way — Finish on the screen, or the other phone — and the
 * server refused because there was nothing left to finish.
 */
export type FinishFailure = 'gone' | 'offline' | 'failed';

export function finishFailure(error: { code: ErrorCode; offline: boolean }): FinishFailure {
    if (error.code === ERROR_CODE.INVALID_STATUS_TRANSITION || error.code === ERROR_CODE.NOT_FOUND)
        return 'gone';
    return error.offline ? 'offline' : 'failed';
}

/** The failure notice's identifier, one per visit so a second failure redraws the first. */
export function failureIdentifier(appointmentId: string): string {
    return `lustre.visit.finish-failed.${appointmentId}`;
}
