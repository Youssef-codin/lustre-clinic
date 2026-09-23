/**
 * The foreground service (`android/`). It keeps the process, and so `/ws`,
 * alive while the app is in the background — Android cuts a cached app's
 * network within seconds — at the price of an ongoing notification. The desk
 * phone runs it to hear the doctor finish; the doctor's runs it while someone
 * is in the chair, and its notification carries the Finish action.
 *
 * Optional, because the JS can run on a native build that predates it: nothing
 * listens in the background there, and nothing breaks.
 */
import { requireOptionalNativeModule } from 'expo';

export interface ListenerNotice {
    title: string;
    body: string;
    channelName: string;
    /** What a locked phone shows in place of the notice. Set whenever the notice names a patient. */
    publicTitle?: string;
    /** One action button. The service drops it the moment it is tapped, showing `pendingBody`. */
    action?: { label: string; id: string; pendingBody: string };
}

interface NativeNotice {
    title: string;
    body: string;
    channelName: string;
    publicTitle: string | null;
    actionLabel: string | null;
    actionId: string | null;
    pendingBody: string | null;
}

interface LustreListenerNative {
    start(notice: NativeNotice): boolean;
    update(notice: NativeNotice): boolean;
    stop(): void;
    addListener(event: 'onFinish', listener: (payload: { id: string }) => void): { remove(): void };
}

const native = requireOptionalNativeModule<LustreListenerNative>('LustreListener');

/** The headless task the service holds open; `index.ts` registers it. */
export const LISTENER_TASK = 'LustreListener';

function toNative(notice: ListenerNotice): NativeNotice {
    return {
        title: notice.title,
        body: notice.body,
        channelName: notice.channelName,
        publicTitle: notice.publicTitle ?? null,
        actionLabel: notice.action?.label ?? null,
        actionId: notice.action?.id ?? null,
        pendingBody: notice.action?.pendingBody ?? null,
    };
}

/** Idempotent: calling it again while it runs only redraws the notification. False when Android refused. */
export function startListening(notice: ListenerNotice): boolean {
    return native?.start(toNative(notice)) ?? false;
}

/**
 * Redraws the running service's notification. Unlike `startListening` it works
 * from the background, where Android refuses a start. False when nothing runs.
 */
export function updateListening(notice: ListenerNotice): boolean {
    return native?.update(toNative(notice)) ?? false;
}

export function stopListening(): void {
    native?.stop();
}

/** The notification's action was tapped, with the `action.id` it carried. */
export function onListenerAction(listener: (id: string) => void): () => void {
    const subscription = native?.addListener('onFinish', ({ id }) => listener(id));
    return () => subscription?.remove();
}
