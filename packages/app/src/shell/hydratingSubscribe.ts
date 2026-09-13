/**
 * The `subscribe` a module store hands `useSyncExternalStore`, for a store that
 * reads storage when something first subscribes rather than at import — so
 * nothing touches the native module until a screen renders. Hydration starts
 * once, on the first subscriber, and is not repeated when listeners come and go.
 */
export function hydratingSubscribe(
    listeners: Set<() => void>,
    hydrate: () => Promise<void>,
): (listener: () => void) => () => void {
    let hydrating = false;

    return (listener) => {
        listeners.add(listener);
        if (!hydrating) {
            hydrating = true;
            void hydrate();
        }
        return () => {
            listeners.delete(listener);
        };
    };
}
