/**
 * The clinic server's clock, as this phone best knows it. Every stamp the app
 * measures against — a check-in, a seat in the chair, a backup — was written
 * by the server, so "now" is read here and not off `Date.now()`: a phone wound
 * an hour forward would otherwise find every check-in an hour old the instant
 * it arrived, and draw a walk-in seated a minute ago as an hour over.
 *
 * The exception is anything the OS fires by the phone's own clock, such as a
 * scheduled local notification.
 *
 * The skew is measured by the clock check (`shell/clockCheck.ts`). Until it
 * has answered, the phone's own clock is all there is. No imports but
 * `@lustre/shared`, so Bun can test what reads it without React Native.
 */
import { todayKey } from '@lustre/shared';

let skewMs = 0;

/** How far the server's clock is ahead of this phone's; negative when behind. */
export function noteServerClock(skew: number): void {
    skewMs = skew;
}

export function serverNow(phoneNow: number = Date.now()): number {
    return phoneNow + skewMs;
}

/** Today's `YYYY-MM-DD` by the server's clock, in this phone's zone like every other key. */
export function serverToday(): string {
    return todayKey(new Date(serverNow()));
}
