import type { IsoDate, OpenSlot, SlotsResponse } from '@mawid/shared';
import { getConfig } from '../../config/index.ts';
import { AppError } from '../../errors/AppError.ts';
import { clinicDayBounds, type Interval, workingIntervals } from '../../util/time.ts';
import { bookedOverlapping } from '../appointment/appointment.service.ts';

/**
 * Slots are packed rather than laid on a fixed grid: within each opening window
 * the finder walks forward one appointment-length at a time and, whenever it
 * meets a booking, resumes at that booking's end. That is how the day actually
 * fills up in the paper book — back-to-back, then tight against whatever is
 * already there — and it avoids a grid leaving 10 unusable minutes in front of
 * every existing appointment.
 */
function slotsInInterval(interval: Interval, booked: Interval[], durationMin: number): OpenSlot[] {
    const slots: OpenSlot[] = [];
    const lengthMs = durationMin * 60_000;
    let cursor = interval.start.getTime();

    while (cursor + lengthMs <= interval.end.getTime()) {
        const clash = booked.find((b) => cursor < b.end.getTime() && b.start.getTime() < cursor + lengthMs);

        if (clash) {
            cursor = clash.end.getTime();
        } else {
            slots.push({ startsAt: new Date(cursor).toISOString() });
            cursor += lengthMs;
        }
    }

    return slots;
}

/**
 * Open slots for one day at one appointment type's duration. A closed day is an
 * empty list, not an error — the desk shows "closed" from `PublicConfig.hours`.
 */
export function findOpenSlots(date: IsoDate, typeId: string): SlotsResponse {
    const { appointmentTypes, hours, clinic } = getConfig();

    const type = appointmentTypes.find((t) => t.id === typeId);
    if (!type) throw AppError.badRequest(`Unknown appointment type "${typeId}"`);

    const day = clinicDayBounds(date, clinic.timezone);
    // Fetched across the whole day rather than per interval: an appointment can
    // start in the morning window and run past its end.
    const booked = bookedOverlapping(day.start, day.end);

    const slots = workingIntervals(date, hours, clinic.timezone).flatMap((interval) =>
        slotsInInterval(interval, booked, type.minutes),
    );

    return { date, typeId, durationMin: type.minutes, slots };
}
