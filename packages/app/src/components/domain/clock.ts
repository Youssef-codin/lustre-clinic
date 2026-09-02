/**
 * The only place a clock time is turned into text. Every time in the app is
 * 12-hour with a meridiem — there is no 24-hour display anywhere — and this is
 * where that is decided, the way `MoneyValue` decides money.
 *
 * Kept free of `react-native` on purpose: `bun test` has no Metro, so anything
 * importing RN cannot be unit tested, and the day cluster's `time.ts` and
 * `chair.ts` are themselves imported by tests. The component that renders these
 * strings is `TimeValue`, which is where the RN import and the layout-direction
 * default live.
 *
 * Digits stay Latin in both languages (§7.11) — DM Mono has no Arabic-Indic
 * coverage and the tabular alignment the day view relies on would break. The
 * meridiem does localize: an Egyptian reader expects ص/م, not AM/PM. It comes
 * back as its own field rather than pre-joined because callers set it at a
 * different size, and because ص/م has to reach the Naskh face without dragging
 * the digits along with it.
 *
 * Storage and transport are unchanged — `TIME` and `timestamptz` as before.
 * This is formatting only; `minutesToClock` in the day cluster is still the
 * 24-hour `HH:MM` the server reads and writes.
 */
import type { Locale } from '@lustre/shared';

export interface Clock12 {
    /** "6:00" — Latin digits, no leading zero on the hour. */
    time: string;
    /** "PM" in English, "م" in Arabic. */
    meridiem: string;
}

export const DAY_MINUTES = 24 * 60;

const MERIDIEM: Record<Locale, { am: string; pm: string }> = {
    en: { am: 'AM', pm: 'PM' },
    ar: { am: 'ص', pm: 'م' },
};

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

/** Minutes since midnight, local time — there is no second timezone. */
export function minutesOfDay(iso: string): number {
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes();
}

export function clock12(minutes: number, locale: Locale = 'en'): Clock12 {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hours = Math.floor(wrapped / 60);
    const marker = MERIDIEM[locale];

    return {
        time: `${hours % 12 === 0 ? 12 : hours % 12}:${pad(wrapped % 60)}`,
        meridiem: hours < 12 ? marker.am : marker.pm,
    };
}

export function time12(iso: string, locale: Locale = 'en'): Clock12 {
    return clock12(minutesOfDay(iso), locale);
}

/** "6:00 PM" — the one-string form, for a label rather than a tabular column. */
export function formatClock12(minutes: number, locale: Locale = 'en'): string {
    const { time, meridiem } = clock12(minutes, locale);
    return `${time} ${meridiem}`;
}

export function formatTime12(iso: string, locale: Locale = 'en'): string {
    return formatClock12(minutesOfDay(iso), locale);
}

/** The same, off a wall-clock timestamp: the connection card's probe stamp. */
export function formatStamp(at: number, locale: Locale = 'en'): string {
    const date = new Date(at);
    return formatClock12(date.getHours() * 60 + date.getMinutes(), locale);
}

/**
 * "10:00 AM – 6:00 PM" — a span with the meridiem on both ends. Working hours
 * and the chair's window both read as a range, and dropping the opening
 * meridiem to save four characters makes 10–6 ambiguous in a clinic that could
 * plausibly do either.
 */
export function formatSpan(from: number, to: number, locale: Locale = 'en'): string {
    return `${formatClock12(from, locale)} – ${formatClock12(to, locale)}`;
}
