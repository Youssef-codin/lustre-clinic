/**
 * The two places the reminder pane and the server disagree about shape.
 *
 * `reminder_notify_at` is a Postgres `time` and arrives as `"HH:MM"`, while the
 * pane models minutes from midnight — which is what its stepper steps, and the
 * same unit the day view measures time in, so it never needs a timezone.
 *
 * The server accepts a 1000-character template; the pane holds the mockup's 320,
 * which is the length that still reads as one message on a phone. The tighter
 * limit is the client's own rule, so it is enforced where it is drawn.
 */

/** The tokens a reminder template may carry, substituted per appointment. */
export const REMINDER_TOKENS = ['{name}', '{date}', '{time}', '{branch}', '{clinic}'] as const;

export const TEMPLATE_MAX = 320;

const DAY_MINUTES = 24 * 60;

/** `"18:30"` → 1110. Seconds are tolerated because Postgres may send them. */
export function minutesFromTime(time: string): number {
    const [hours, minutes] = time.split(':');
    const total = Number(hours) * 60 + Number(minutes);
    return Number.isFinite(total) ? Math.min(Math.max(total, 0), DAY_MINUTES - 1) : 0;
}

/** 1110 → `"18:30"`, zero-padded, which is what `updateSettingsInput` expects. */
export function timeFromMinutes(minutes: number): string {
    const wrapped = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const mm = String(wrapped % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}
