// biome-ignore lint/style/noRestrictedImports: subscribes to `AppState`, because Open reminders is tapped outside the app and lands as a foreground
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { takeOpenRequest } from '../../modules/lustre-alarm';

/**
 * Calls `onOpen` when the app comes up from the ringing alarm's Open
 * reminders. Checked on mount as well as on foreground: the tap can be what
 * started the app. `onOpen` should be stable, or the listener is re-added
 * every render.
 */
export function useAlarmOpen(onOpen: () => void): void {
    useEffect(() => {
        const check = () => {
            if (takeOpenRequest()) onOpen();
        };

        check();
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') check();
        });
        return () => subscription.remove();
    }, [onOpen]);
}
