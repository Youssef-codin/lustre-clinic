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
 * matching `Date#getDay` and `clinic_days.weekday`. The weekday and month names
 * are English until the F4 localisation scaffold lands. The header pill adds
 * the weekday off today, because a bare date does not say whether Thursday is
 * the day she meant.
 *
 * Clock times are not formatted here. They come from `domain/clock`, the one
 * place in the app that turns a time into text, and are re-exported so this
 * stays the day cluster's single time import. That file is reached directly
 * rather than through the `domain` barrel because the barrel pulls in
 * `react-native`, and this module and `chair.ts` are both imported by
 * `day.test.ts`, which runs under Bun with no Metro.
 *
 * The calendar arithmetic does stay in `@lustre/shared` — it has no cluster in
 * it and the settings panes want the same functions. The clock does not: a
 * meridiem is presentation and it localizes, and `packages/shared` is for
 * contracts.
 *
 * What is left here is transport, not display: `clockToMinutes` reads the
 * 24-hour `HH:MM` the server sends, and nothing in this cluster writes one back
 * — the schedule is edited in settings, which has its own `timeFromMinutes`.
 */
import { dateKey, localizeCopy, localOffsetMinutes, offsetForDate, parseKey, todayKey } from '@lustre/shared';
import { getLocale } from '../../i18n/runtime';

export {
    clock12,
    formatClock12,
    formatDuration,
    formatElapsed,
    formatSpan,
    formatTime12,
    minutesOfDay,
    secondsOfDay,
    time12,
} from '../../components/domain/clock';

export { dateKey, localOffsetMinutes, offsetForDate, parseKey, todayKey };

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

export function clockToMinutes(clock: string): number {
    const [hours = 0, minutes = 0] = clock.split(':').map(Number);
    return hours * 60 + minutes;
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

/** Weekday and month names are copy, and the date helpers below are called
 * from plain functions rather than rendered, so they localize themselves. */
function say(copy: string): string {
    return localizeCopy(getLocale(), copy);
}

/**
 * "Thursday, 12 June 2026" — the visit screens' identity line. Spelled out in
 * full because those screens are the record of what happened on a day, and
 * `Thu 12 Jun` is the form for a list being scanned, not for a line being read.
 */
export function formatLongDate(key: string): string {
    const date = parseKey(key);
    return `${say(WEEKDAYS[date.getDay()] ?? '')}, ${date.getDate()} ${say(MONTHS[date.getMonth()] ?? '')} ${date.getFullYear()}`;
}

export function formatDate(key: string): string {
    const date = parseKey(key);
    return `${say(WEEKDAYS_SHORT[date.getDay()] ?? '')} ${date.getDate()} ${say(MONTHS_SHORT[date.getMonth()] ?? '')}`;
}

export function formatDatePill(key: string, today: string = todayKey()): string {
    const date = parseKey(key);
    const month = MONTHS_SHORT[date.getMonth()] ?? '';
    const stamp = `${date.getDate()} ${getLocale() === 'ar' ? say(month) : month.toUpperCase()}`;
    if (key === today) return stamp;
    const weekday = WEEKDAYS_SHORT[date.getDay()] ?? '';
    return `${getLocale() === 'ar' ? say(weekday) : weekday.toUpperCase()} ${stamp}`;
}

/** The month a date tile shows under its number. */
export function monthShort(key: string): string {
    return say(MONTHS_SHORT[parseKey(key).getMonth()] ?? '');
}

export function formatMonth(key: string): string {
    const date = parseKey(key);
    return `${say(MONTHS_SHORT[date.getMonth()] ?? '')} ${date.getFullYear()}`;
}

export function relativeDayLabel(key: string, today: string = todayKey()): string {
    if (key === today) return say('Today');
    if (key === addDays(today, 1)) return say('Tomorrow');
    if (key === addDays(today, -1)) return say('Yesterday');
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
