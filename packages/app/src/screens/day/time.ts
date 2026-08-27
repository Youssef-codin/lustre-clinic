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
 * matching `Date#getDay` and `clinic_days.weekday`.
 *
 * `clock12`/`time12` are what a row shows: they return the meridiem separately
 * because it is set at a different size. `formatTime` is 24-hour and is now
 * only for the two ends of a span — "09:00 – 09:30" on the detail sheet, the
 * chair's window — where one meridiem per end doubles the width of a label
 * nobody reads a time off. It used to be the row format too, "so the row and
 * ruler line up in DM Mono's tabular figures"; the ruler went when the
 * timeline became a list, and `AppointmentRow` was the last row still on it.
 * A single time on screen is 12-hour. The weekday and
 * month names are English until the F4 localisation scaffold lands. The header
 * pill adds the weekday off today, because a bare date does not say whether
 * Thursday is the day she meant.
 */

// The calendar arithmetic and the 12-hour clock are `@lustre/shared/dates` —
// they have no cluster in them and the settings panes want the same ones.
// Re-exported here so the day cluster keeps one import for time.
import type { Clock12 } from '@lustre/shared';
import {
    clock12,
    DAY_MINUTES,
    dateKey,
    localOffsetMinutes,
    offsetForDate,
    parseKey,
    todayKey,
} from '@lustre/shared';

export type { Clock12 };
export { clock12, DAY_MINUTES, dateKey, localOffsetMinutes, offsetForDate, parseKey, todayKey };

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
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

export function time12(iso: string): Clock12 {
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
const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
] as const;

export function weekdayName(weekday: number): string {
    return WEEKDAYS[weekday] ?? '';
}

/**
 * "Thursday, 12 June 2026" — the visit screens' identity line. Spelled out in
 * full because those screens are the record of what happened on a day, and
 * `Thu 12 Jun` is the form for a list being scanned, not for a line being read.
 */
export function formatLongDate(key: string): string {
    const date = parseKey(key);
    return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
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
