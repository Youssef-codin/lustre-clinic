/**
 * What `/ws` does, without a socket.
 *
 * The handlers announce the same `WS_EVENT`s the services broadcast (§13), and
 * `live.ts` subscribes here instead of opening a socket when the app is in demo
 * mode. That is worth the few lines: the invalidation those events drive is
 * what refreshes the money dashboard after a payment and the day view after a
 * checkout, so a demo without them would need every screen to be right about
 * refetching itself — which is exactly the difference from production a demo
 * must not have.
 *
 * Delivery is deferred a tick. A handler broadcasts before its own result has
 * been returned, and invalidating a query while the mutation that caused it is
 * still in flight refetches the state it is about to replace.
 */
import type { WsEvent } from '@lustre/shared';

type Listener = (event: WsEvent) => void;

const listeners = new Set<Listener>();

export function subscribeToDemoEvents(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function broadcast(event: WsEvent): void {
    setTimeout(() => {
        for (const listener of listeners) listener(event);
    }, 0);
}
