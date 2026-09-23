/**
 * The guard for a press that writes. `Button` and `IconButton` already swallow a
 * repeat press for `pressLockMs`, and that covers the frames before the caller's
 * state flips — but only for the one control, and only while the finger is on
 * it. What it does not cover is the write itself: `isPending` is state, so two
 * taps landing in the same frame both read the old `false`, and a row tapped
 * while another row's write is in flight is a second mutation the screen never
 * meant to send. Both of those are a double booking, or a payment taken twice.
 *
 * So the in-flight flag is a ref, checked and set in the handler: an overlapping
 * call is refused outright rather than queued, the way `screens/patients/data`
 * and `screens/day/data` already refuse one. `pending` is the state beside it,
 * for the spinner — pass it to the control's `loading`.
 *
 * A failure clears the flag like a success does, so the action is immediately
 * retryable, and the rejection is swallowed rather than thrown: a caller that
 * closes a sheet on success must not end up standing in front of one, and the
 * error belongs on screen (the mutation's own `error`), not in an unhandled
 * rejection.
 */
// biome-ignore lint/style/noRestrictedImports: the outside thing is the write itself — a slow answer must not set state on a control that has left the screen
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PendingAction<Args extends unknown[]> {
    run: (...args: Args) => void;
    pending: boolean;
}

export function usePendingAction<Args extends unknown[]>(
    action: (...args: Args) => Promise<unknown>,
): PendingAction<Args> {
    const [pending, setPending] = useState(false);

    const actionRef = useRef(action);
    actionRef.current = action;

    const inFlight = useRef(false);

    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const run = useCallback((...args: Args) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);

        void (async () => {
            try {
                await actionRef.current(...args);
            } catch {
                // Held by whatever ran the write; a rejection here would be unhandled.
            } finally {
                inFlight.current = false;
                if (mounted.current) setPending(false);
            }
        })();
    }, []);

    return { run, pending };
}
