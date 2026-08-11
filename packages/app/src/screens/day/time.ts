/**
 * Dates as the clinic sees them. The server takes a `YYYY-MM-DD` and an
 * `offsetMinutes` and works out the day boundary itself, so the client's whole
 * job is to say which local day it means and where in that day a time falls —
 * and everything here is local time; there is no second timezone. The offset
 * the server wants is the one in force on the date in question
 * (`offsetForDate`): Egypt keeps DST, and today's offset applied to a day on
 * the other side of the changeover moves the range by an hour, enough to drop
 * a late appointment off the end of its day. `dateKey` must never be
 * `toISOString`, which is UTC. Weekdays are 0 = Sunday … 6 = Saturday,
 * matching `Date#getDay` and `clinic_days.weekday`. `formatTime` is 24-hour so
 * the row and ruler line up in DM Mono's tabular figures; `clock12` returns the
 * meridiem separately because it is set at a different size. The weekday and
 * month names are English until the F4 localisation scaffold lands. The header
 * pill adds the weekday off today, because a bare date does not say whether
 * Thursday is the day she meant.
 */

export const DAY_MINUTES = 24 * 60;

export function localOffsetMinutes(now: Date = new Date()): number {
    return -now.getTimezoneOffset();
}

export function offsetForDate(key: string): number {
    return localOffsetMinutes(parseKey(key));
}

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

export function dateKey(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
    return dateKey(now);
}

export function parseKey(key: string): Date {
    const [year = 1970, month = 1, day = 1] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
    const date = parseKey(key);
    date.setDate(date.getDate() + days);
    return dateKey(date);
}

export function weekdayOf(key: string): number {
    return parseKey(key).getDay();
}

export function minutesOfDay(iso: string): number {
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes();
}

export function minutesToClock(minutes: number): string {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

export function clockToMinutes(clock: string): number {
    const [hours = 0, minutes = 0] = clock.split(':').map(Number);
    return hours * 60 + minutes;
}

export function formatTime(iso: string): string {
    return minutesToClock(minutesOfDay(iso));
}

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

export function formatDate(key: string): string {
    const date = parseKey(key);
    return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function formatDatePill(key: string, today: string = todayKey()): string {
    const date = parseKey(key);
    const stamp = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`.toUpperCase();
    return key === today ? stamp : `${WEEKDAYS_SHORT[date.getDay()]?.toUpperCase()} ${stamp}`;
}

/** The month a date tile shows under its number. */
export function monthShort(key: string): string {
    return MONTHS_SHORT[parseKey(key).getMonth()] ?? '';
}

export function formatMonth(key: string): string {
    const date = parseKey(key);
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function relativeDayLabel(key: string, today: string = todayKey()): string {
    if (key === today) return 'Today';
    if (key === addDays(today, 1)) return 'Tomorrow';
    if (key === addDays(today, -1)) return 'Yesterday';
    return formatDate(key);
}

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
