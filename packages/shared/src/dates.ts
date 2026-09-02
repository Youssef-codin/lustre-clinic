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
 * `clock12` is here for the same reason `offsetForDate` is: the day view and the
 * settings panes both put a time on screen, and a second copy of the wrap-around
 * and the midnight/noon cases is how the two drift. It returns the meridiem
 * separately because the two are set at different sizes. English until the F4
 * localization scaffold lands.
 */

export const DAY_MINUTES = 24 * 60;

export function localOffsetMinutes(now: Date = new Date()): number {
    return -now.getTimezoneOffset();
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

export interface Clock12 {
    time: string;
    meridiem: 'AM' | 'PM';
}

/** Minutes past local midnight as a 12-hour clock. Midnight is 12 AM and noon is 12 PM. */
export function clock12(minutes: number): Clock12 {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hours = Math.floor(wrapped / 60);

    return {
        time: `${hours % 12 === 0 ? 12 : hours % 12}:${pad(wrapped % 60)}`,
        meridiem: hours < 12 ? 'AM' : 'PM',
    };
}

/** "6:00 PM" — the one-string form, for a label rather than a tabular column. */
export function formatClock12(minutes: number): string {
    const { time, meridiem } = clock12(minutes);
    return `${time} ${meridiem}`;
}

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}
