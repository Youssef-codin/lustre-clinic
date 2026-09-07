import { describe, expect, it } from 'bun:test';
import {
    beneath,
    canPop,
    emptyStack,
    isOpen,
    pop,
    popToRoot,
    push,
    type RouteStack,
    rendered,
    replaceTop,
    resetTo,
    settled,
    top,
} from './routeStack';

type Route = 'record' | 'edit' | 'visit';

function stackOf(...open: Route[]): RouteStack<Route> {
    return open.reduce<RouteStack<Route>>(push, emptyStack<Route>());
}

/** The routes with a pane on screen, without the ids a caller keys on. */
function drawn(stack: RouteStack<Route>): Route[] {
    return rendered(stack).map((entry) => entry.route);
}

function ids(stack: RouteStack<Route>): number[] {
    return rendered(stack).map((entry) => entry.id);
}

describe('routeStack', () => {
    it('starts at the root with nothing to pop', () => {
        const stack = emptyStack<Route>();

        expect(top(stack)).toBeUndefined();
        expect(beneath(stack)).toBeUndefined();
        expect(canPop(stack)).toBe(false);
        expect(drawn(stack)).toEqual([]);
    });

    it('stacks bottom to top', () => {
        const stack = stackOf('record', 'edit');

        expect(drawn(stack)).toEqual(['record', 'edit']);
        expect(top(stack)).toBe('edit');
        expect(beneath(stack)).toBe('record');
        expect(canPop(stack)).toBe(true);
    });

    it('keeps a popped route drawn until it has finished leaving', () => {
        const popped = pop(stackOf('record', 'edit'));

        expect(top(popped)).toBe('record');
        // Still rendered, and no longer open: this is the entry mid-slide, and
        // dropping it here is what blanks the pane halfway out.
        expect(drawn(popped)).toEqual(['record', 'edit']);
        expect(isOpen(popped, 0)).toBe(true);
        expect(isOpen(popped, 1)).toBe(false);

        expect(drawn(settled(popped))).toEqual(['record']);
    });

    it('draws a leaving route above the one it was stacked on', () => {
        // Popped in the order they were opened, so the deeper of the two must
        // still come first — it is underneath.
        const twice = pop(pop(stackOf('record', 'edit', 'visit')));

        expect(twice.open.map((entry) => entry.route)).toEqual(['record']);
        expect(twice.leaving.map((entry) => entry.route)).toEqual(['edit', 'visit']);
        expect(drawn(twice)).toEqual(['record', 'edit', 'visit']);
    });

    it('drops leaving routes topmost first, one report at a time', () => {
        const twice = pop(pop(stackOf('record', 'edit')));

        expect(drawn(twice)).toEqual(['record', 'edit']);
        expect(drawn(settled(twice))).toEqual(['record']);
        expect(drawn(settled(settled(twice)))).toEqual([]);
        // A third report has nothing left to answer for.
        expect(drawn(settled(settled(settled(twice))))).toEqual([]);
    });

    it('pops nothing at the root', () => {
        const root = emptyStack<Route>();

        expect(pop(root)).toEqual(root);
        expect(popToRoot(root)).toEqual(root);
    });

    it('sends every route out together on popToRoot', () => {
        const home = popToRoot(stackOf('record', 'edit', 'visit'));

        expect(home.open).toEqual([]);
        expect(drawn(home)).toEqual(['record', 'edit', 'visit']);
        expect(canPop(home)).toBe(false);
    });

    it('clears anything mid-slide when a new route is pushed', () => {
        // Otherwise the arriving pane slides in over one still sliding out, and
        // the two transitions draw across each other.
        const reopened = push(pop(stackOf('record')), 'edit');

        expect(drawn(reopened)).toEqual(['edit']);
    });

    it('swaps the top without a pop', () => {
        const saved = replaceTop(stackOf('record', 'edit'), 'record');

        expect(drawn(saved)).toEqual(['record', 'record']);
        expect(saved.leaving).toEqual([]);
    });

    it('pushes when there is no top to replace', () => {
        expect(drawn(replaceTop(emptyStack<Route>(), 'record'))).toEqual(['record']);
    });

    it('drops everything but the one route on resetTo', () => {
        const jumped = resetTo(stackOf('record', 'edit'), 'record');

        expect(drawn(jumped)).toEqual(['record']);
        expect(jumped.leaving).toEqual([]);
    });

    describe('identity', () => {
        it('gives every drawn entry a distinct id', () => {
            const stack = stackOf('record', 'edit', 'visit');

            expect(new Set(ids(stack)).size).toBe(3);
        });

        it('keeps an id when its route is popped and is still leaving', () => {
            const stack = stackOf('record', 'edit');
            const before = ids(stack);

            expect(ids(pop(stack))).toEqual(before);
        });

        // The one that matters. Booking for one patient, backing out and
        // booking for another puts both at the same depth: a pane keyed by
        // depth would hand the second one the first one's half-typed form.
        it('gives a replacement at the same depth a new id', () => {
            const first = stackOf('edit');
            const second = resetTo(first, 'edit');

            expect(ids(second)).not.toEqual(ids(first));
        });

        it('does not reuse an id still held by a route on its way out', () => {
            const leavingOne = pop(stackOf('record'));
            const withNew = { ...leavingOne, open: push(leavingOne, 'edit').open };

            expect(new Set([...ids(leavingOne), ...withNew.open.map((e) => e.id)]).size).toBe(2);
        });

        it('replaceTop gives the new route its own id', () => {
            const stack = stackOf('record', 'edit');
            const saved = replaceTop(stack, 'record');

            expect(saved.open[1]?.id).not.toBe(stack.open[1]?.id);
        });
    });

    it('never mutates the stack it was given', () => {
        const stack = stackOf('record', 'edit');
        const before = drawn(stack);

        pop(stack);
        popToRoot(stack);
        push(stack, 'visit');
        replaceTop(stack, 'visit');
        resetTo(stack, 'visit');
        settled(stack);

        expect(drawn(stack)).toEqual(before);
    });
});
