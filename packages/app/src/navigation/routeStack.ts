// A cluster's routes, as a stack rather than as a set of booleans that imply
// one between them. There is still no navigator (SPEC §18 F3) and this is not
// one: it holds no screens, renders nothing, and knows nothing about Lustre.
// It is the answer to a question the app only started asking when the hardware
// back arrived — *what is on top* — from something that does not already know.
//
// Two lists, not one. `open` is what the user is on; `leaving` is what has been
// popped and is still sliding off, kept because the screen animating out still
// has to draw, and it draws from its route. That is the shape the clusters were
// already in by hand — `DayScreen` kept `visitOpen` apart from `visit` for
// exactly this reason — made explicit and given a name. `settled` is what drops
// a route once `PushView` says the slide is done.
//
// Order is bottom-up: `rendered` gives the root's children first and the
// topmost pane last, which is the order they are drawn in and the reverse of
// the order they are asked about.
//
// Every entry carries an `id`, and that is what a caller keys its panes on.
// Position will not do: opening a booking for one patient and then another
// puts both at the same depth, and a pane keyed by depth would keep the first
// one's half-typed form for the second.

/** One route, and the identity that survives another route taking its place. */
export type StackEntry<T> = {
    readonly id: number;
    readonly route: T;
};

export type RouteStack<T> = {
    /** Bottom to top. Empty means the cluster is at its root. */
    readonly open: readonly StackEntry<T>[];
    /** Popped, still animating out. Drawn, not reachable. */
    readonly leaving: readonly StackEntry<T>[];
};

export function emptyStack<T>(): RouteStack<T> {
    return { open: [], leaving: [] };
}

/**
 * Unique across everything the stack is still drawing, which is all it has to
 * be — an id is a React key and nothing reads it back. It falls to 0 once the
 * last pane has left, and by then no key can collide with it.
 */
function nextId<T>(stack: RouteStack<T>): number {
    let highest = -1;
    for (const entry of rendered(stack)) highest = Math.max(highest, entry.id);
    return highest + 1;
}

/**
 * A push of the route already on top is the second tap, and it is refused.
 *
 * Every pane opens from a press, and a press surface that is not `ui/Button` or
 * `ui/IconButton` — `AddButton`, a card, a row — carries no press lock, so two
 * taps on Add a procedure both ran. Each is its own `setStack` updater, so
 * neither saw the other's route land: the editor opened twice, and closing it
 * once left the second copy standing. The guard belongs here rather than on
 * each of those surfaces because this is where the duplicate is expressed, and
 * one stack covers every way a route is reached.
 *
 * Equal by value, not by identity: `{ kind: 'new' }` is a fresh object per tap.
 * And only against the *top* — the same route deeper in the stack is a patient
 * reached from a patient, which is a real place to be, and a route pushed again
 * after its pane was popped finds a different top and goes through.
 */
export function push<T>(stack: RouteStack<T>, route: T): RouteStack<T> {
    if (stack.open.length > 0 && sameRoute(top(stack), route)) return stack;
    // Anything on its way out goes now rather than sliding away under the
    // arriving pane, which would draw two transitions over each other.
    return { open: [...stack.open, { id: nextId(stack), route }], leaving: [] };
}

/**
 * Structural equality over what a route is made of: a string, a number, or a
 * record of them — `{ kind: 'edit', procedure }` included, where the two taps
 * carry the same procedure read from the same list.
 */
function sameRoute(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every(
        (key) =>
            Object.hasOwn(b, key) &&
            sameRoute((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
}

export function pop<T>(stack: RouteStack<T>): RouteStack<T> {
    if (stack.open.length === 0) return stack;
    return {
        open: stack.open.slice(0, -1),
        leaving: [...stack.open.slice(-1), ...stack.leaving],
    };
}

export function popToRoot<T>(stack: RouteStack<T>): RouteStack<T> {
    if (stack.open.length === 0) return stack;
    // All of them leave at once, keeping the order they were stacked in — only
    // the topmost is visible, and the ones beneath it slide out behind it.
    return { open: [], leaving: [...stack.open, ...stack.leaving] };
}

/**
 * Swaps the top for another route — a save landing on the record it wrote. A
 * new id, because it is a different screen: the one it replaces must not leave
 * its state behind for it.
 */
export function replaceTop<T>(stack: RouteStack<T>, route: T): RouteStack<T> {
    if (stack.open.length === 0) return push(stack, route);
    return {
        open: [...stack.open.slice(0, -1), { id: nextId(stack), route }],
        leaving: stack.leaving,
    };
}

/**
 * Down to one route, with nothing left to watch leave. For a jump from outside
 * the cluster — the shell landing on a patient's record from another tab —
 * where whatever was stacked is not what the user came from. The arriving route
 * is a fresh entry and still slides in; it is the outgoing panes that are
 * dropped rather than animated.
 */
export function resetTo<T>(stack: RouteStack<T>, route: T): RouteStack<T> {
    return { open: [{ id: nextId(stack), route }], leaving: [] };
}

/**
 * Back to the root with nothing left to watch leave. For a page that returns to
 * another tab: the pane it covers is hidden in the same commit, so a slide out
 * would play to nobody and its `onClosed` is not something to wait on.
 */
export function clear<T>(stack: RouteStack<T>): RouteStack<T> {
    if (stack.open.length === 0 && stack.leaving.length === 0) return stack;
    return emptyStack<T>();
}

/** Everything with a pane on screen, bottom first. Open ones, then leaving. */
export function rendered<T>(stack: RouteStack<T>): readonly StackEntry<T>[] {
    return [...stack.open, ...stack.leaving];
}

/** Whether the pane at this index of `rendered` is on its way in or already up. */
export function isOpen<T>(stack: RouteStack<T>, index: number): boolean {
    return index < stack.open.length;
}

export function top<T>(stack: RouteStack<T>): T | undefined {
    return stack.open[stack.open.length - 1]?.route;
}

/**
 * What the top would return to. This is what a stack replaces the old `from`
 * fields with: the editor no longer records which screen opened it, because the
 * stack already knows, and two copies of that could disagree.
 */
export function beneath<T>(stack: RouteStack<T>): T | undefined {
    return stack.open[stack.open.length - 2]?.route;
}

export function canPop<T>(stack: RouteStack<T>): boolean {
    return stack.open.length > 0;
}

/**
 * Whether `id` is still the entry on top. What something that went away and
 * came back asks before it moves the stack — a save that lands after the pane
 * that started it has gone.
 *
 * The check is worth more than it looks: nothing here changes what is under the
 * top without changing which entry the top is. `push` and `replaceTop` put a
 * fresh id there, `pop` and `popToRoot` take it away, and `resetTo` does both.
 * So a top that still matches is a stack that has not moved at all, and a
 * decision made from an older copy of it is still the right one.
 */
export function isTop<T>(stack: RouteStack<T>, id: number): boolean {
    return stack.open[stack.open.length - 1]?.id === id;
}

/**
 * A pane has finished leaving, so it stops being drawn. Which one is not asked:
 * they leave in the order they were popped, and dropping the oldest is the same
 * answer whichever of them reported. Popping twice quickly is the case that
 * makes it matter — both report, and the second finds nothing left to drop.
 */
export function settled<T>(stack: RouteStack<T>): RouteStack<T> {
    if (stack.leaving.length === 0) return stack;
    return { open: stack.open, leaving: stack.leaving.slice(0, -1) };
}
