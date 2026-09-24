/**
 * The clinic server's clock, as this phone best knows it. A `/ws` frame is
 * stamped by the server, so anything that asks how old one is has to ask in
 * the server's time: a doctor's phone wound an hour forward would otherwise
 * find every check-in an hour old the instant it arrived.
 *
 * The skew is measured by the clock check (`shell/clockCheck.ts`). Until it
 * has answered, the phone's own clock is all there is.
 */
let skewMs = 0;

/** How far the server's clock is ahead of this phone's; negative when behind. */
export function noteServerClock(skew: number): void {
    skewMs = skew;
}

export function serverNow(phoneNow: number = Date.now()): number {
    return phoneNow + skewMs;
}
