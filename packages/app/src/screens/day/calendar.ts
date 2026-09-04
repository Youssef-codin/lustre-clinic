// Whether the calendar sheet is up, and which opening it is. Both day screens
// hold this and both drive it the same way, so the two transitions live here
// rather than as four inline updaters — and here they can be tested, which an
// updater written into JSX cannot be.
//
// `seq` is what the sheet is keyed on. It is remounted per opening on purpose:
// the month and the pending day are `useState` initialised from the date the
// screen is on, so a sheet that survived would reopen on the month the desk was
// reading last week rather than the day behind it.
//
// Which is exactly why opening is not allowed to bump `seq` while the sheet is
// already up. A tap on the date pill during the entrance — and the entrance is
// long enough to invite one, since the pill is not covered until the backdrop
// lands — used to change the key underneath a presented sheet: React unmounted
// it and mounted a fresh one, which mounts already visible and so presented
// itself a second time. The sheet appeared to open, close and open again.
// Returning `current` unchanged makes React bail out of the render entirely,
// so the second tap costs nothing at all.

export type CalendarState = {
    open: boolean;
    seq: number;
};

export const CALENDAR_CLOSED: CalendarState = { open: false, seq: 0 };

/** A tap on the date pill. Spent, not queued, when the sheet is already up. */
export function openCalendar(current: CalendarState): CalendarState {
    if (current.open) return current;
    return { open: true, seq: current.seq + 1 };
}

/** Dismissed, by the backdrop, the hardware back, or a day being picked. */
export function closeCalendar(current: CalendarState): CalendarState {
    if (!current.open) return current;
    return { ...current, open: false };
}
