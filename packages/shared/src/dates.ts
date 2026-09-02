/**
 * Date arithmetic with no cluster in it. These are local-clock helpers: the
 * client's whole job is to say which local day it means, and the server takes
 * that `YYYY-MM-DD` with an explicit `offsetMinutes` and works out the day
 * boundary itself. There is no second timezone anywhere in this app.
 *
 * `offsetForDate` is the reason this is worth having in one place rather than
 * three. Egypt keeps DST, and today's offset applied to a day on the other side
 * of the changeover moves the range by an hour — enough to drop a late
 * appointment off the end of its day. The offset the server wants is the one in
 * force on the date in question, not the one in force now.
 *
 * `dateKey` must never be `toISOString`, which is UTC.
 *
 * Calendar arithmetic only — no clock formatting. A time on screen is 12-hour
 * with a meridiem, the meridiem localizes to ص/م, and both of those are
 * presentation rather than a contract, so they live in the app at
 * `components/domain/clock.ts`. This file briefly carried a `clock12` of its
 * own; two copies of the same wrap-around is exactly the drift that one place
 * exists to prevent.
 */

export const DAY_MINUTES = 24 * 60;

export function localOffsetMinutes(now: Date = new Date()): number {
    return -now.getTimezoneOffset();
}

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

export function dateKey(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(key: string): Date {
    const [year = 1970, month = 1, day = 1] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function todayKey(now: Date = new Date()): string {
    return dateKey(now);
}

export function offsetForDate(key: string): number {
    return localOffsetMinutes(parseKey(key));
}

/** The Gregorian calendar, not a rule about any particular date. */
export function daysInMonth(year: number, month: number): number {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}
