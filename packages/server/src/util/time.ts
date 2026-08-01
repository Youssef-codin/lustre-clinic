import type { IsoDate, IsoInstant, TimeOfDay, Weekday, WorkingHours } from '@mawid/shared';

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

/** The clinic-local calendar day an instant falls on. */
export function clinicDate(instant: Date | string, timezone: string): IsoDate {
    return toClinicClock(instant, timezone).date;
}

/**
 * How far `timezone` is from UTC at a given instant, in ms. Derived from what
 * the zone actually displays rather than from a table, so DST is whatever the
 * platform's tzdata says it is — Egypt reintroduced it in 2023.
 */
function zoneOffsetMs(instant: Date, timezone: string): number {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(instant);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === type)?.value ?? 0);

    const wallClock = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second'),
    );
    return wallClock - (instant.getTime() - instant.getMilliseconds());
}

/**
 * Clinic wall-clock (`2026-08-02`, `17:00`) → the UTC instant it names.
 *
 * Two passes: the first guesses using the offset at the same wall time read as
 * UTC, the second corrects it when that guess landed on the far side of a DST
 * change. Without the second pass a booking made on a clock-change weekend
 * lands an hour out.
 */
export function clinicTimeToInstant(date: IsoDate, time: TimeOfDay, timezone: string): Date {
    const asUtc = Date.parse(`${date}T${time}:00.000Z`);
    const guess = new Date(asUtc - zoneOffsetMs(new Date(asUtc), timezone));
    return new Date(asUtc - zoneOffsetMs(guess, timezone));
}

/** Weekday of a calendar date, 0 = Sunday — the keys of `config.hours`. */
export function weekdayOf(date: IsoDate): Weekday {
    return String(new Date(`${date}T00:00:00.000Z`).getUTCDay()) as Weekday;
}

export function addDays(date: IsoDate, days: number): IsoDate {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export interface Interval {
    start: Date;
    end: Date;
}

/** The UTC window covering one clinic-local calendar day, half-open. */
export function clinicDayBounds(date: IsoDate, timezone: string): Interval {
    return {
        start: clinicTimeToInstant(date, '00:00', timezone),
        end: clinicTimeToInstant(addDays(date, 1), '00:00', timezone),
    };
}

/**
 * The clinic's opening windows on one date, as UTC instants. An empty array
 * means closed — `config.hours` omits a day to mark it shut.
 */
export function workingIntervals(date: IsoDate, hours: WorkingHours, timezone: string): Interval[] {
    return (hours[weekdayOf(date)] ?? []).map((range) => ({
        start: clinicTimeToInstant(date, range.from, timezone),
        end: clinicTimeToInstant(date, range.to, timezone),
    }));
}

/**
 * Whether an appointment fits entirely inside one opening window. Ranges never
 * cross midnight (`timeRangeSchema` requires `from < to`), so a single day's
 * intervals are all that need checking.
 */
export function fitsWorkingHours(
    startsAt: IsoInstant | Date,
    durationMin: number,
    hours: WorkingHours,
    timezone: string,
): boolean {
    const start = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
    const end = new Date(start.getTime() + durationMin * 60_000);

    return workingIntervals(clinicDate(start, timezone), hours, timezone).some(
        (interval) => start >= interval.start && end <= interval.end,
    );
}
