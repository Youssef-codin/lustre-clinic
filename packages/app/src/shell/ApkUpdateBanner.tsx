import { X } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { Banner, Button, IconButton } from '../components/ui';
import { useT } from '../i18n';
import { useApkUpdate } from '../screens/settings/data/appUpdate';
import { color, space } from '../theme';
import { dismissApkUpdate, useDismissedApkUpdate } from './updateDismissStore';

/**
 * The strip over the day that says the clinic server has a newer APK (§15).
 * Settings has the card with the build number and the how-to; this is the
 * nudge that gets someone there — the day is the screen a clinic phone lives
 * on, and a card two taps away is one nobody finds until told.
 *
 * Dismissable, per build: the X puts it away for this release on this phone
 * (`updateDismissStore`) and the next release brings it back. Never a modal —
 * installing leaves the app, and that is the doctor's call to make between
 * patients.
 */
export function ApkUpdateBanner() {
    const t = useT();
    const update = useApkUpdate();
    const dismissed = useDismissedApkUpdate();

    if (!update || !dismissed.hydrated || dismissed.versionCode === update.versionCode) return null;

    return (
        <Banner
            tone="info"
            message={t('New version ready · Lustre {version}', { version: update.version })}
            action={
                <View style={styles.actions}>
                    <Button
                        label="Download"
                        variant="text"
                        size="md"
                        onPress={() => void Linking.openURL(update.url)}
                        testID="home-apk-download"
                    />
                    <IconButton
                        accessibilityLabel="Dismiss"
                        icon={<X size={16} strokeWidth={2.2} color={color.ink2} />}
                        variant="bare"
                        onPress={() => dismissApkUpdate(update.versionCode)}
                        testID="home-apk-dismiss"
                    />
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    actions: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
});
