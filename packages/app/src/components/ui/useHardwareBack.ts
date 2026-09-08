/**
 * Android's back: the button on a three-button bar, the edge swipe on a gesture
 * one. They are the same event, and an app that does not answer it hands it to
 * the activity, which finishes — so back from a pushed screen leaves the app
 * altogether. On a gesture phone that reads as a crash.
 *
 * `onBack` says what happened: `true` swallows the press, `false` hands it back
 * to Android, which is what closes the app. Only the last handler in the app
 * has any business returning `false`.
 *
 * **The subscription tracks `enabled` and nothing else.** React Native runs
 * these listeners newest-first and stops at the first one to answer, so the
 * order they subscribed in *is* the priority order — and re-subscribing jumps
 * the queue. A handler whose identity changed every render would keep promoting
 * itself above a sheet that opened after it, and back would pop the screen
 * behind the sheet instead of closing it. So the listener is registered once
 * per enable and calls through a ref that render keeps current.
 */
// biome-ignore lint/style/noRestrictedImports: subscribes to `BackHandler`, an OS event delivered outside React
import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

export function useHardwareBack(enabled: boolean, onBack: () => boolean): void {
    const latest = useRef(onBack);
    latest.current = onBack;

    useEffect(() => {
        if (!enabled) return;

        const guard = BackHandler.addEventListener('hardwareBackPress', () => latest.current());
        return () => guard.remove();
    }, [enabled]);
}
