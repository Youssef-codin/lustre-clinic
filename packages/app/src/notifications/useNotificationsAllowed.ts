/**
 * Whether the OS will let a nudge through, for the pane that sets it up.
 *
 * Without this the settings pane has the same defect the scheduler just fixed,
 * one layer out: "Notify me at 6:00 PM" saves, reads back, and the phone stays
 * silent — because notifications are off for the app and nothing on screen says
 * so. A setting that cannot take effect has to admit it.
 *
 * Re-read on foreground, because the way this gets fixed is the user leaving for
 * Android settings and coming back.
 */
// biome-ignore lint/style/noRestrictedImports: subscribes to `AppState` to re-read the OS permission on foreground — the fix happens in Android settings, outside the app
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { canTakeOverLockScreen } from '../../modules/lustre-alarm';
import { notificationsAllowed } from './notifications';

export type NotificationsAllowed = 'unknown' | 'allowed' | 'blocked';

export function useNotificationsAllowed(): NotificationsAllowed {
    return useReadOnForeground(async () => ((await notificationsAllowed()) ? 'allowed' : 'blocked'));
}

/** Whether a ringing alarm may fill the lock screen. Android 14 lets the user take that away. */
export function useLockScreenAllowed(): NotificationsAllowed {
    return useReadOnForeground(async () => (canTakeOverLockScreen() ? 'allowed' : 'blocked'));
}

function useReadOnForeground(read: () => Promise<NotificationsAllowed>): NotificationsAllowed {
    const [allowed, setAllowed] = useState<NotificationsAllowed>('unknown');

    // biome-ignore lint/correctness/useExhaustiveDependencies: `read` is a fresh closure each render and reads nothing from it
    useEffect(() => {
        let live = true;

        const update = () => {
            void read().then((next) => {
                if (live) setAllowed(next);
            });
        };

        update();
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') update();
        });

        return () => {
            live = false;
            subscription.remove();
        };
    }, []);

    return allowed;
}
