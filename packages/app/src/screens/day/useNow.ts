import { useEffect, useState } from 'react';
import { minutesOfDay } from './time';

/**
 * The current time, in minutes since midnight, ticking.
 *
 * The day view is open all day on a desk, so "now" is not the time the screen
 * was mounted: the now-line, the wait counters and the countdown to the next
 * patient all move. Half a minute is fine — nothing here shows seconds, and a
 * per-second timer on a screen nobody is looking at costs battery for nothing.
 */
const TICK_MS = 30_000;

function nowMinutes(): number {
    return minutesOfDay(new Date().toISOString());
}

export function useNowMinutes(): number {
    const [minutes, setMinutes] = useState(nowMinutes);

    // A clock is the case an effect is for: an outside source of truth that
    // changes on its own.
    useEffect(() => {
        const timer = setInterval(() => setMinutes(nowMinutes()), TICK_MS);
        return () => clearInterval(timer);
    }, []);

    return minutes;
}
