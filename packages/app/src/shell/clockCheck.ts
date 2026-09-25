/**
 * Whether this phone's clock can be trusted against the clinic server's.
 *
 * The app reads and writes every booked time in the phone's own zone, and
 * measures the chair and the waiting room from stamps the server wrote with
 * its own clock. A handset on the wrong zone therefore books a 3:00 as 4:00,
 * and one whose clock was wound forward to hide that shows a walk-in seated a
 * minute ago as half an hour over. Neither is visible on the phone itself: the
 * time in the status bar looks right in both cases.
 *
 * The zone is checked before the clock because it is the cause more often —
 * the clock is usually wrong *because* someone corrected the wrong zone by
 * hand — and because it is the one that corrupts bookings rather than only
 * the timers.
 */

import { CLOCK_JUMP_TOLERANCE_MS, type ClockSample } from '../api/serverClock';

export type ClockProblem = { kind: 'zone' } | { kind: 'clock'; offByMinutes: number };

/** How far apart the two clocks can be before the timers visibly lie. */
const CLOCK_TOLERANCE_MS = 2 * 60_000;

/** A reply slower than this says too little about when the server read its clock. */
const MAX_ROUND_TRIP_MS = 30_000;

/**
 * How far the server's clock is ahead of the phone's, or null when the reading
 * says too little: a reply too slow to place, or the phone's time set while the
 * request was out, which shows as the wall clock and the monotonic one
 * disagreeing about how long it took.
 */
export function clockSkew(serverNow: number, sent: ClockSample, received: ClockSample): number | null {
    const elapsed = received.wall - sent.wall;
    if (elapsed < 0 || elapsed > MAX_ROUND_TRIP_MS) return null;
    if (Math.abs(elapsed - (received.mono - sent.mono)) > CLOCK_JUMP_TOLERANCE_MS) return null;
    // The server read its clock somewhere inside the round trip; the midpoint
    // is the best guess, and the tolerance dwarfs the error in it.
    return serverNow - (sent.wall + received.wall) / 2;
}

export function clockProblem(
    server: { now: number; utcOffsetMinutes: number },
    sent: ClockSample,
    received: ClockSample,
    phoneOffsetMinutes: number,
): ClockProblem | null {
    if (phoneOffsetMinutes !== server.utcOffsetMinutes) return { kind: 'zone' };

    const skew = clockSkew(server.now, sent, received);
    if (skew === null || Math.abs(skew) <= CLOCK_TOLERANCE_MS) return null;

    return { kind: 'clock', offByMinutes: Math.round(Math.abs(skew) / 60_000) };
}
