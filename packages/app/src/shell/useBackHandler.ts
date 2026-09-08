/**
 * How a screen answers the hardware back. The shell owns the one `BackHandler`
 * listener (`AppShell`) and each pane carries its stack down through this
 * context, so a screen anywhere inside a cluster registers without anything
 * having to be threaded through the props between them.
 *
 * The context value is a stack, created once per pane and never replaced. That
 * is deliberate: the four clusters are memoised so a tab switch costs nothing
 * below the shell, and a context whose value changed would re-render every
 * screen that reads it, switch after switch.
 *
 * The handler runs on every back press the pane is asked about, so it decides
 * for itself — `return true` having popped something, `false` to let the press
 * fall through to whatever is underneath, and finally to the shell. See
 * `backStack.ts` for why it registers once and answers rather than registering
 * only when it has something to pop.
 */
// biome-ignore lint/style/noRestrictedImports: registers with the pane's back stack, which the shell's `BackHandler` listener reads from outside this tree
import { createContext, useContext, useEffect, useRef } from 'react';
import type { BackHandler, BackStack } from './backStack';

export const BackStackContext = createContext<BackStack | null>(null);

export function useBackHandler(handler: BackHandler): void {
    const stack = useContext(BackStackContext);
    const latest = useRef(handler);
    latest.current = handler;

    useEffect(() => {
        if (!stack) return;
        return stack.push(() => latest.current());
    }, [stack]);
}
