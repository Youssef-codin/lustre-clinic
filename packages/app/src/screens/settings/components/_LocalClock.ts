/**
 * Twelve-hour clock formatting, which the reminders pane and the connection
 * card's "last checked" stamp both need. A local copy of `screens/day/time.ts`'s
 * `clock12`, the same way `_LocalMoneyValue` copies the money formatter:
 * reaching across clusters for eight lines is what makes two clusters one, and
 * the shared home for this is `domain/`, which does not exist yet. Logged in
 * BLOCKED.md with the other stand-ins.
 */
export interface Clock12 {
    time: string;
    meridiem: 'AM' | 'PM';
}

const DAY_MINUTES = 24 * 60;

export function clock12(minutes: number): Clock12 {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hours = Math.floor(wrapped / 60);
    const mins = wrapped % 60;

    return {
        time: `${hours % 12 === 0 ? 12 : hours % 12}:${String(mins).padStart(2, '0')}`,
        meridiem: hours < 12 ? 'AM' : 'PM',
    };
}

/** "6:00 PM" — the one-string form, for a label rather than a tabular column. */
export function formatClock12(minutes: number): string {
    const { time, meridiem } = clock12(minutes);
    return `${time} ${meridiem}`;
}

/** The same, off a wall-clock timestamp: the connection card's probe stamp. */
export function formatStamp(at: number): string {
    const date = new Date(at);
    return formatClock12(date.getHours() * 60 + date.getMinutes());
}
