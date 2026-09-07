/**
 * A cluster's route stack, with the hardware back already on it. Back is `pop`
 * and nothing else, which is the point: the chevron and the back press call the
 * same function, so the two cannot come to disagree about where a screen
 * returns to. No cluster writes a back handler.
 *
 * `locked` is for the things in the old chains that were never navigation — a
 * save in flight, an editor mid-write, reorder mode. A locked stack still
 * swallows the press, the way `Sheet` does: a write cannot be cancelled into an
 * unknown state, and letting the press fall through to the tab underneath would
 * be worse than ignoring it.
 *
 * `settled` is wired to `PushView`'s `onClosed` by the caller, one per rendered
 * pane. Until it fires, a popped route is still drawn — see `routeStack.ts`.
 */
import { useMemo, useState } from 'react';
import { useBackHandler } from '../shell/useBackHandler';
import {
    canPop,
    emptyStack,
    pop,
    popToRoot,
    push,
    type RouteStack,
    replaceTop,
    resetTo,
    settled,
    top,
} from './routeStack';

export type RouteStackOptions = {
    /**
     * Swallow back without popping. For the things the old chains guarded that
     * were never navigation — a save in flight, an editor mid-write, reorder
     * mode. Swallowed rather than passed on, the way `Sheet` does it: a write
     * cannot be cancelled into an unknown state, and handing the press to the
     * tab underneath would be worse than ignoring it.
     */
    locked?: boolean;
    /**
     * What back means with nothing left to pop. The default is to decline, so
     * the press falls through to whatever is underneath and finally to the
     * shell. A cluster that is itself a pushed pane overrides this to close.
     */
    atRoot?: () => boolean;
};

export type RouteStackControls<T> = {
    stack: RouteStack<T>;
    /** The route on top, or undefined at the root. */
    current: T | undefined;
    push(route: T): void;
    pop(): void;
    popToRoot(): void;
    replaceTop(route: T): void;
    resetTo(route: T): void;
    /** A pane has finished sliding out. Wire to `PushView`'s `onClosed`. */
    settled(): void;
};

export function useRouteStack<T>(options: RouteStackOptions = {}): RouteStackControls<T> {
    const [stack, setStack] = useState<RouteStack<T>>(emptyStack<T>);
    const { locked = false, atRoot } = options;

    useBackHandler(() => {
        if (locked) return true;
        if (!canPop(stack)) return atRoot?.() ?? false;
        setStack(pop);
        return true;
    });

    // Built once. Every one of these is a prop on a screen, and a cluster whose
    // handlers changed identity each render would undo the memoisation the shell
    // depends on (`shell/AppShell.tsx`).
    const controls = useMemo(
        () => ({
            push: (route: T) => setStack((current) => push(current, route)),
            pop: () => setStack(pop),
            popToRoot: () => setStack(popToRoot),
            replaceTop: (route: T) => setStack((current) => replaceTop(current, route)),
            resetTo: (route: T) => setStack((current) => resetTo(current, route)),
            settled: () => setStack(settled),
        }),
        [],
    );

    return { stack, current: top(stack), ...controls };
}
