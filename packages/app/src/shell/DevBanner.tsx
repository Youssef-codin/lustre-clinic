import { StyleSheet, View } from 'react-native';
import { BUILD_VARIANT, showsDevBanner, useConnection } from '../api';
import { useT } from '../i18n';
import { color, size, space, Text } from '../theme';
import { DEV_LABEL, serverLabel } from './serverLabel';
import { useServerSetup } from './serverStore';

/**
 * The strip that says this is not the clinic's app. It stands above every
 * screen — setup, the shell, the offline dead end — because the moment it is
 * needed is the one where a dev build and a real one look alike.
 *
 * `BUILD_VARIANT` rather than anything in `app.json`: Metro sets `__DEV__`
 * false in every release bundle whatever the config says (`api/variant.ts`), so
 * a clinic's APK cannot carry this by somebody forgetting to flip a flag, and a
 * dev build cannot lose it by the same mistake.
 *
 * It takes its own row rather than floating over one. An overlay obvious enough
 * to be worth having is an overlay over a control.
 */
export function DevBanner() {
    const t = useT();
    const { baseUrl } = useConnection();
    const { addresses } = useServerSetup();

    if (!showsDevBanner(BUILD_VARIANT)) return null;

    const server = serverLabel(baseUrl, addresses);

    return (
        <View
            accessible
            accessibilityLabel={t('Development build, {server}', { server })}
            style={styles.strip}
        >
            <Text variant="eyebrow" tone="inverse">
                {DEV_LABEL}
            </Text>
            <Text variant="footnote" tone="inverse" numberOfLines={1} style={styles.server}>
                {server}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    strip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingHorizontal: size.gutter,
        paddingVertical: space[1.5],
        backgroundColor: color.due,
    },
    server: { flex: 1 },
});
