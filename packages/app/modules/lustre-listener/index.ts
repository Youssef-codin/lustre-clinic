/**
 * The desk phone's foreground service (`android/`). It keeps the process, and
 * so `/ws`, alive while the app is in the background — Android cuts a cached
 * app's network within seconds — at the price of an ongoing notification.
 *
 * Optional, because the JS can run on a native build that predates it: nothing
 * listens in the background there, and nothing breaks.
 */
import { requireOptionalNativeModule } from 'expo';

interface LustreListenerNative {
    start(title: string, body: string, channelName: string): boolean;
    stop(): void;
}

const native = requireOptionalNativeModule<LustreListenerNative>('LustreListener');

/** The headless task the service holds open; `index.ts` registers it. */
export const LISTENER_TASK = 'LustreListener';

/** Idempotent: calling it again while it runs only redraws the notification. False when Android refused. */
export function startListening(title: string, body: string, channelName: string): boolean {
    return native?.start(title, body, channelName) ?? false;
}

export function stopListening(): void {
    native?.stop();
}
