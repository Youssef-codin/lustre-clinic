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
import { notificationsAllowed } from './notifications';

export type NotificationsAllowed = 'unknown' | 'allowed' | 'blocked';

export function useNotificationsAllowed(): NotificationsAllowed {
    const [allowed, setAllowed] = useState<NotificationsAllowed>('unknown');

    useEffect(() => {
        let live = true;

        const read = () => {
            void notificationsAllowed().then((granted) => {
                if (live) setAllowed(granted ? 'allowed' : 'blocked');
            });
        };

        read();
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') read();
        });

        return () => {
            live = false;
            subscription.remove();
        };
    }, []);

    return allowed;
}
