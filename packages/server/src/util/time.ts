/**
 * Everything is stored and passed around as UTC ISO-8601. Clinic-local time
 * exists only for display and for scheduling decisions — never in the db.
 */

export function nowIso(): string {
    return new Date().toISOString();
}

export interface ClinicClock {
    /** YYYY-MM-DD in clinic time. */
    date: string;
    /** HH:MM in clinic time, 24h. */
    time: string;
    /** 0 = Sunday, matching the keys of `config.hours`. */
    weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

/** Break a UTC instant into the clinic's local date, time and weekday. */
export function toClinicClock(instant: Date | string, timezone: string): ClinicClock {
    const date = typeof instant === 'string' ? new Date(instant) : instant;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';

    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${get('hour')}:${get('minute')}`,
        weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    };
}
