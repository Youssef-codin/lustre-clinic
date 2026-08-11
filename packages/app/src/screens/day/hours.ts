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

export function hoursFor(dateKey: string, schedule: readonly ClinicDay[] | undefined): DayHours | null {
    const weekday = weekdayOf(dateKey);

    if (schedule !== undefined && schedule.length > 0) {
        const day = schedule.find((row) => row.weekday === weekday);
        return day ? { opens: clockToMinutes(day.opensAt), closes: clockToMinutes(day.closesAt) } : null;
    }

    return DEFAULTS[weekday] ?? null;
}

export function isClosed(dateKey: string, schedule: readonly ClinicDay[] | undefined): boolean {
    return hoursFor(dateKey, schedule) === null;
}

export function openMinutes(dateKey: string, schedule: readonly ClinicDay[] | undefined): number {
    const hours = hoursFor(dateKey, schedule);
    return hours ? hours.closes - hours.opens : 0;
}
