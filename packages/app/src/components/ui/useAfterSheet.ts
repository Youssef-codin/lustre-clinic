/**
 * Work a sheet has to finish leaving before: the navigation, tab switch or role
 * change that its confirm was for.
 *
 * A caller that does both in one tick gets them in the wrong order. Setting the
 * sheet's flag false only queues the exit — `Sheet` starts it from an effect, so
 * it runs behind the commit that has already put the destination on screen — and
 * what the user sees is the sheet still at full height over a screen that has
 * changed underneath it. Handing the work here instead and running it from
 * `Sheet`'s `onClosed` puts the exit first, which is the order the sheet's own
 * animation was written for.
 *
 * It is a ref rather than state because nothing here is drawn: the pending work
 * is a message between an animation and the code that started it, and putting it
 * in state would re-render the screen twice for a sheet that is on its way out.
 */
import { useCallback, useRef } from 'react';

export type AfterSheet = {
    /** Hold `run` until the sheet is off the screen. Call it with the close. */
    after: (run: () => void) => void;
    /** `Sheet`'s `onClosed`. Runs whatever was held, once. */
    closed: () => void;
};

export function useAfterSheet(): AfterSheet {
    const pending = useRef<(() => void) | null>(null);

    const after = useCallback((run: () => void) => {
        pending.current = run;
    }, []);

    // Cleared before running, not after: a close that was nobody's answer — a
    // cancel, a scrim — must not inherit the last one's.
    const closed = useCallback(() => {
        const run = pending.current;
        pending.current = null;
        run?.();
    }, []);

    return { after, closed };
}
