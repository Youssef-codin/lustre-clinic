/**
 * Opening and closing hours, one module on purpose — nothing else in the
 * cluster may assume a clinic hour; the calendar's load bars, the walk-in
 * sheet's default time and the "closed" verdict all come from here. MAW-1
 * landed `clinic_days`/`settings.schedule`, so the server is the source when
 * it has one. `DEFAULTS` is what a clinic that has never opened Settings gets
 * — an empty schedule means "not configured", not "closed every day of the
 * week", and seven closed days on a fresh install is a bug report. `undefined`
 * is "not loaded yet"; both fall back to the defaults, because a timeline drawn
 * against nothing is worse than one drawn against a guess (Egyptian clinics
 * keep evening hours and close on Friday).
 */
import type { ClinicDay } from './data/types';
import { clockToMinutes, weekdayOf } from './time';

export interface DayHours {
    opens: number;
    closes: number;
}

const DEFAULTS: Readonly<Record<number, DayHours | null>> = {
    0: { opens: 10 * 60, closes: 22 * 60 },
    1: { opens: 10 * 60, closes: 22 * 60 },
    2: { opens: 10 * 60, closes: 22 * 60 },
    3: { opens: 10 * 60, closes: 22 * 60 },
    4: { opens: 10 * 60, closes: 22 * 60 },
    5: null,
    6: { opens: 10 * 60, closes: 22 * 60 },
};

/**
 * `branchId` narrows the question from "is the clinic working" to "is *this*
 * branch working" — `clinic_days` carries a branch per row, and a clinic that
 * runs Maadi on Thursday and Nasr City on Wednesday has no clinic-wide answer.
 * Asking unscoped is still right for the month grid, which counts every branch
 * on purpose; asking scoped is what anything booking into a branch must do,
 * because the unscoped answer draws a Nasr City grid out of Maadi's hours and
 * then finds no Maadi bookings in it, so every slot reads free.
 */
export function hoursFor(
    dateKey: string,
    schedule: readonly ClinicDay[] | undefined,
    branchId?: string | null,
): DayHours | null {
    const weekday = weekdayOf(dateKey);

    if (schedule !== undefined && schedule.length > 0) {
        const day = schedule.find(
            (row) => row.weekday === weekday && (!branchId || row.branchId === branchId),
        );
        return day ? { opens: clockToMinutes(day.opensAt), closes: clockToMinutes(day.closesAt) } : null;
    }

    return DEFAULTS[weekday] ?? null;
}

export function isClosed(
    dateKey: string,
    schedule: readonly ClinicDay[] | undefined,
    branchId?: string | null,
): boolean {
    return hoursFor(dateKey, schedule, branchId) === null;
}

export function openMinutes(
    dateKey: string,
    schedule: readonly ClinicDay[] | undefined,
    branchId?: string | null,
): number {
    const hours = hoursFor(dateKey, schedule, branchId);
    return hours ? hours.closes - hours.opens : 0;
}
