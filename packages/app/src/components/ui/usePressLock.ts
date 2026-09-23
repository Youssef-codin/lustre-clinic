/**
 * Swallows a repeat press for `lockMs`. `Button` and `IconButton` each had this
 * written out; `AddButton` is the one that never got it, and a list editor's Add
 * takes two taps in a frame as two options because `disabled` only catches up on
 * the next render.
 *
 * It covers the gap between the finger going down and the caller's state
 * flipping, and nothing wider: one control, one gesture. A write needs
 * `usePendingAction` as well — that is what refuses a second tap landing on a
 * different control, and what holds for as long as the write is actually in
 * flight rather than for a fixed 500ms. A route push needs neither, because the
 * stack itself refuses a push of the route already on top.
 *
 * `lockMs` of 0 turns it off, for a control meant to be tapped repeatedly —
 * month nav on a calendar, a stepper.
 */
import { useCallback, useRef } from 'react';

export function usePressLock(lockMs: number): (press: () => void) => void {
    const lockedUntil = useRef(0);

    return useCallback(
        (press: () => void) => {
            const now = Date.now();
            if (now < lockedUntil.current) return;
            lockedUntil.current = now + lockMs;
            press();
        },
        [lockMs],
    );
}
