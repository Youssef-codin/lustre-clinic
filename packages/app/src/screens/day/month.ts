/**
 * How full each day of a month is, counted across every branch. The calendar
 * asks the clinic's question — "is Thursday busy" is not asked one branch at a
 * time — so the month is unscoped, and the cost of that is a grid that can
 * promise a day the branch-scoped day view then draws empty. `busiest` is what
 * pays it: the pick carries the branch holding most of that day, and the day
 * view moves with it. Cancelled and no-show rows hold no slot, so they neither
 * make a day look busy nor pull the pick to their branch.
 */
import { DEFAULT_DURATION_MINUTES, SLOT_HOLDING_STATUSES } from '@mawid/shared';
import type { Appointment, ClinicDay } from './data/types';
import { openMinutes } from './hours';

export interface DayLoad {
    count: number;
    /** Slots the booked minutes take up, and how many the day holds. A row is
     * 10 to 45 minutes long, so counting rows against capacity reads "18 of 16
     * slots" on a day of short visits; minutes divide evenly. */
    used: number;
    slots: number;
    fill: number;
    firstAt: string | null;
    busiest: string | null;
}

export function holdsSlot(appointment: Appointment): boolean {
    return (SLOT_HOLDING_STATUSES as readonly string[]).includes(appointment.status);
}

/**
 * The branch holding the most of a day's slots. A tie stays on `current` — an
 * even day is not a reason to move the day view — and otherwise falls to the
 * first branch to appear in the day, so the answer does not depend on the
 * order the rows arrived in. A day with nothing booked has no busiest branch,
 * and moves nothing.
 */
export function busiestBranch(rows: readonly Appointment[], current: string | null): string | null {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.branchId, (counts.get(row.branchId) ?? 0) + 1);

    let best: string | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
        if (count > bestCount || (count === bestCount && id === current)) {
            best = id;
            bestCount = count;
        }
    }

    return best;
}

export function loadsFrom(
    days: readonly string[],
    perDay: readonly Appointment[][],
    schedule: readonly ClinicDay[] | undefined,
    current: string | null,
): Map<string, DayLoad> {
    const loads = new Map<string, DayLoad>();

    days.forEach((day, index) => {
        const holding = (perDay[index] ?? []).filter(holdsSlot);
        const booked = holding.reduce((total, row) => total + row.durationMinutes, 0);
        const open = openMinutes(day, schedule);
        const slots = Math.floor(open / DEFAULT_DURATION_MINUTES);
        const firstAt = holding.map((row) => row.startsAt).sort((a, b) => a.localeCompare(b))[0];

        loads.set(day, {
            count: holding.length,
            used: Math.min(Math.ceil(booked / DEFAULT_DURATION_MINUTES), slots),
            slots,
            fill: open > 0 ? Math.min(booked / open, 1) : 0,
            firstAt: firstAt ?? null,
            busiest: busiestBranch(holding, current),
        });
    });

    return loads;
}
