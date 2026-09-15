/**
 * A cluster's route stack, with the hardware back already on it. Back is `back`
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
import { useMemo, useRef, useState } from 'react';
import { noteScreen } from '../reporting/trail';
import { useBackHandler } from '../shell/useBackHandler';
import {
    canPop,
    clear,
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

export type RouteStackOptions<T> = {
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
    /**
     * Where back goes from a route that was not opened from the one beneath it.
     * A page another tab pushed here returns to that tab, not to this cluster's
     * root. `true` once it has been taken there; `false` pops as usual.
     */
    backFrom?: (route: T) => boolean;
};

export type RouteStackControls<T> = {
    stack: RouteStack<T>;
    /** The route on top, or undefined at the root. */
    current: T | undefined;
    push(route: T): void;
    /** Back, as the chevron and the hardware press both mean it — `backFrom` first, then a pop. */
    back(): void;
    pop(): void;
    popToRoot(): void;
    /** To the root without a slide out — for a route that has just left for another tab. */
    clear(): void;
    replaceTop(route: T): void;
    resetTo(route: T): void;
    /** A pane has finished sliding out. Wire to `PushView`'s `onClosed`. */
    settled(): void;
};

export function useRouteStack<T>(options: RouteStackOptions<T> = {}): RouteStackControls<T> {
    const [stack, setStack] = useState<RouteStack<T>>(emptyStack<T>);
    const { locked = false, atRoot, backFrom } = options;

    // `back` is one of the stable controls below, so it reads what it decides
    // from through a ref rather than closing over one render's copy.
    const latest = useRef({ stack, backFrom });
    latest.current = { stack, backFrom };

    // Built once. Every one of these is a prop on a screen, and a cluster whose
    // handlers changed identity each render would undo the memoisation the shell
    // depends on (`shell/AppShell.tsx`).
    //
    // Each move leaves a crash-report crumb naming the route it went to. A route
    // that is a record rather than a screen name is dropped by the allow-list.
    const controls = useMemo(
        () => ({
            push: (route: T) => {
                noteScreen(route);
                setStack((current) => push(current, route));
            },
            back: () => {
                noteScreen('back');
                const current = top(latest.current.stack);
                if (current !== undefined && latest.current.backFrom?.(current)) return;
                setStack(pop);
            },
            pop: () => {
                noteScreen('back');
                setStack(pop);
            },
            popToRoot: () => {
                noteScreen('home');
                setStack(popToRoot);
            },
            clear: () => setStack(clear),
            replaceTop: (route: T) => {
                noteScreen(route);
                setStack((current) => replaceTop(current, route));
            },
            resetTo: (route: T) => {
                noteScreen(route);
                setStack((current) => resetTo(current, route));
            },
            settled: () => setStack(settled),
        }),
        [],
    );

    useBackHandler(() => {
        if (locked) return true;
        if (!canPop(stack)) return atRoot?.() ?? false;
        controls.back();
        return true;
    });

    return { stack, current: top(stack), ...controls };
}
