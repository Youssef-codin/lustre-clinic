import type { IsoDate, IsoInstant, Locale, Weekday } from '@mawid/shared';

/**
 * Everything the UI shows is clinic-local; everything it sends is UTC. The
 * conversion goes through the IANA zone in `PublicConfig.clinic.timezone` — see
 * the warning in `@mawid/shared/time.ts` about slicing an instant into a date.
 *
 * `Intl` does the timezone work: no date library, and the browser already has
 * the tz database that a library would ship a copy of.
 */

/** Numeric locale tags. Arabic keeps Latin digits, matching the dictionaries. */
const INTL_LOCALE: Record<Locale, string> = {
    ar: 'ar-EG-u-nu-latn',
    en: 'en-GB',
};

const PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timezone: string): Intl.DateTimeFormat {
    let formatter = PART_FORMATTERS.get(timezone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        PART_FORMATTERS.set(timezone, formatter);
    }
    return formatter;
}

/**
 * `YYYY-MM-DD` and `HH:MM` split into fixed-length tuples. The defaults exist
 * only to satisfy `noUncheckedIndexedAccess` — both inputs are schema-validated
 * upstream, so they never apply.
 */
function dateParts(date: IsoDate): [number, number, number] {
    const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
    return [year, month, day];
}

function timeParts(time: string): [number, number] {
    const [hour = 0, minute = 0] = time.split(':').map(Number);
    return [hour, minute];
}

/** The wall-clock reading in `timezone`, re-encoded as if it were UTC. */
function wallClockAsUtc(instant: Date, timezone: string): number {
    const parts = partsFormatter(timezone).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find((p) => p.type === type)?.value ?? 0);

    // Some engines render midnight as hour 24 under hour12: false.
    return Date.UTC(
        part('year'),
        part('month') - 1,
        part('day'),
        part('hour') % 24,
        part('minute'),
        part('second'),
    );
}

/** Which clinic-local calendar day an absolute instant falls on. */
export function clinicDay(instant: IsoInstant | Date, timezone: string): IsoDate {
    const date = typeof instant === 'string' ? new Date(instant) : instant;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date) as IsoDate;
}

/** Today, as the clinic reckons it — not as the device's own timezone does. */
export function todayInClinic(timezone: string): IsoDate {
    return clinicDay(new Date(), timezone);
}

/**
 * A clinic-local date and `HH:MM` → the absolute instant it names.
 *
 * Two passes: the first guesses using the offset in force at the *equivalent
 * UTC* moment, the second corrects it using the offset actually in force at the
 * guess. They differ only across a DST transition — Egypt observes one.
 */
export function clinicTimeToInstant(date: IsoDate, time: string, timezone: string): IsoInstant {
    const [year, month, day] = dateParts(date);
    const [hour, minute] = timeParts(time);
    const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);

    let guess = wallAsUtc - (wallClockAsUtc(new Date(wallAsUtc), timezone) - wallAsUtc);
    guess = wallAsUtc - (wallClockAsUtc(new Date(guess), timezone) - guess);

    return new Date(guess).toISOString();
}

/** `HH:MM`, 24-hour, in clinic time. What every row in the day view shows. */
export function formatClinicTime(instant: IsoInstant, timezone: string, locale: Locale): string {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(instant));
}

/** e.g. "Sunday 3 August" / "الأحد ٣ أغسطس" — the date navigator's label. */
export function formatClinicDate(date: IsoDate, locale: Locale): string {
    const [year, month, day] = dateParts(date);
    return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        // Built as UTC midnight below, so it must be read back as UTC.
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Calendar arithmetic on the date itself — no timezone involved, because
 * "the next day" is a question about the calendar, not about instants.
 */
export function addDays(date: IsoDate, days: number): IsoDate {
    const [year, month, day] = dateParts(date);
    // Safe to slice: this Date was deliberately built at UTC midnight.
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10) as IsoDate;
}

/** Day-of-week key for `PublicConfig.hours`, 0 = Sunday. */
export function weekdayOf(date: IsoDate): Weekday {
    const [year, month, day] = dateParts(date);
    return String(new Date(Date.UTC(year, month - 1, day)).getUTCDay()) as Weekday;
}

/** Minutes between two instants — used to size gaps in the day list. */
export function minutesBetween(from: IsoInstant, to: IsoInstant): number {
    return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}
