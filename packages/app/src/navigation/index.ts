// Route stacks. Not the navigator (SPEC §18 F3) — this holds no screens and
// renders nothing. It is the shape each cluster was already keeping by hand,
// named and given the one operation the hardware back needs: pop.
export type { RouteStack, StackEntry } from './routeStack';
export {
    beneath,
    canPop,
    emptyStack,
    isOpen,
    pop,
    popToRoot,
    push,
    rendered,
    replaceTop,
    resetTo,
    settled,
    top,
} from './routeStack';
export type { RouteStackControls, RouteStackOptions } from './useRouteStack';
export { useRouteStack } from './useRouteStack';
