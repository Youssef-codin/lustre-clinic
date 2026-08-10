/**
 * Dates as the clinic sees them.
 *
 * The server takes a `YYYY-MM-DD` and an `offsetMinutes` and works out the day
 * boundary itself (`appointment.byDate`), so the client's whole job is to say
 * which local day it means and where in that day a time falls.
 *
 * Everything here is local time. A clinic is a room; there is no second
 * timezone to reconcile.
 */

/** Minutes in a day, for the timeline's arithmetic. */
export const DAY_MINUTES = 24 * 60;

/** What the server wants as `offsetMinutes`: east of UTC is positive. */
export function localOffsetMinutes(now: Date = new Date()): number {
    return -now.getTimezoneOffset();
}

/**
 * The offset **of the day being asked about**, which is not always today's.
 *
 * The server turns `{ date, offsetMinutes }` into a range of instants, so the
 * offset has to be the one in force on that date. Egypt keeps DST, and today's
 * offset applied to a day the other side of the changeover moves the range by an
 * hour — enough to drop a late appointment off the end of its day and hang it on
 * the next one. `getTimezoneOffset` is per-instant, so asking the date itself is
 * the whole fix.
 */
export function offsetForDate(key: string): number {
    return localOffsetMinutes(parseKey(key));
}

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

/** `YYYY-MM-DD` for a local date. Never `toISOString`, which is UTC. */
export function dateKey(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
    return dateKey(now);
}

/** Local midnight on that key. */
export function parseKey(key: string): Date {
    const [year = 1970, month = 1, day = 1] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
    const date = parseKey(key);
    date.setDate(date.getDate() + days);
    return dateKey(date);
}

/** 0 = Sunday … 6 = Saturday, matching `Date#getDay` and `clinic_days.weekday`. */
export function weekdayOf(key: string): number {
    return parseKey(key).getDay();
}

/** Minutes since local midnight for an ISO timestamp off the wire. */
export function minutesOfDay(iso: string): number {
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes();
}

/** `HH:MM` — minutes since midnight. */
export function minutesToClock(minutes: number): string {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** `HH:MM` from the schedule back to minutes. */
export function clockToMinutes(clock: string): number {
    const [hours = 0, minutes = 0] = clock.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * The time on an appointment row and on the ruler beside it. 24-hour, so the
 * two line up in DM Mono's tabular figures and `13:00` cannot be read as one
 * o'clock in the morning.
 */
export function formatTime(iso: string): string {
    return minutesToClock(minutesOfDay(iso));
}

/**
 * The same minute the way `day-view-schedule.html` writes it: `11:35` in mono at
 * the row's size, `AM` beside it at two thirds of it. The meridiem comes back
 * separately because it is set separately — one string would force one size.
 *
 * The 24-hour `formatTime` above stays for the places that are a clock rather
 * than a row: the ruler in the calendar sheet, and every label read aloud.
 */
export function clock12(minutes: number): { time: string; meridiem: 'AM' | 'PM' } {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hours = Math.floor(wrapped / 60);
    return {
        time: `${hours % 12 === 0 ? 12 : hours % 12}:${pad(wrapped % 60)}`,
        meridiem: hours < 12 ? 'AM' : 'PM',
    };
}

export function time12(iso: string): { time: string; meridiem: 'AM' | 'PM' } {
    return clock12(minutesOfDay(iso));
}

/**
 * A local-midnight ISO string with the offset the server expects, for writes
 * that name a time — booking into a gap, moving an appointment.
 */
export function isoAt(key: string, minutes: number): string {
    const date = parseKey(key);
    date.setMinutes(minutes);
    const offset = localOffsetMinutes(date);
    const sign = offset < 0 ? '-' : '+';
    const abs = Math.abs(offset);
    const stamp =
        `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00` +
        `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    return stamp;
}

// Localisation is F4 and has not landed, so the names are English here rather
// than reaching for a dictionary that does not exist. They move to it wholesale.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

export function weekdayName(weekday: number): string {
    return WEEKDAYS[weekday] ?? '';
}

/** `Sat 9 Aug` — what sits under the big relative label. */
export function formatDate(key: string): string {
    const date = parseKey(key);
    return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/**
 * What the header pill says: `4 AUG`, as in the design.
 *
 * Off today it gains the weekday — `WED 5 AUG`. The design only ever draws
 * today, and the weekday is the fact that changes when the secretary has
 * wandered: a bare date does not say whether Thursday is the day she meant.
 */
export function formatDatePill(key: string, today: string = todayKey()): string {
    const date = parseKey(key);
    const stamp = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`.toUpperCase();
    return key === today ? stamp : `${WEEKDAYS_SHORT[date.getDay()]?.toUpperCase()} ${stamp}`;
}

export function formatMonth(key: string): string {
    const date = parseKey(key);
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * `Today` / `Tomorrow` / `Yesterday`, else the date. The secretary is on today
 * nearly all day, so the header says which day it is in the word she would use.
 */
export function relativeDayLabel(key: string, today: string = todayKey()): string {
    if (key === today) return 'Today';
    if (key === addDays(today, 1)) return 'Tomorrow';
    if (key === addDays(today, -1)) return 'Yesterday';
    return formatDate(key);
}

/** Every day in `key`'s month, in order. */
export function monthDays(key: string): string[] {
    const start = parseKey(key);
    start.setDate(1);
    const month = start.getMonth();
    const days: string[] = [];
    while (start.getMonth() === month) {
        days.push(dateKey(start));
        start.setDate(start.getDate() + 1);
    }
    return days;
}

export function addMonths(key: string, months: number): string {
    const date = parseKey(key);
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    return dateKey(date);
}
