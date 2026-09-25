import { Linking } from 'react-native';
import { useDemoMode } from '../api';
import { Banner, Button } from '../components/ui';
import { useT } from '../i18n';
import { useNotificationsAllowed } from '../notifications';

/**
 * The strip over the day that says the OS is blocking notifications. Both
 * phones run on one: the doctor hears a check-in from it and the desk hears
 * the doctor finish, and without it the listener service does not start either,
 * so nothing arrives even with the app in front. Nothing else on the day says
 * so. Coming back from Android settings re-reads the permission, which clears it.
 */
export function NotificationsBanner() {
    const t = useT();
    const allowed = useNotificationsAllowed();
    // Demo mode has nobody else to hear from.
    const { enabled: demo } = useDemoMode();

    if (demo || allowed !== 'blocked') return null;

    return (
        <Banner
            tone="warning"
            message={t('Notifications are off for this app')}
            action={
                <Button
                    label="Open settings"
                    variant="text"
                    size="md"
                    onPress={() => void Linking.openSettings().catch(() => undefined)}
                    testID="home-notifications-settings"
                />
            }
        />
    );
}
