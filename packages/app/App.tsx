import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { color, radius, shadow, size, space, Text, useAppFonts } from './src/theme';

// Token smoke test. This is not a screen and nothing here survives the first real
// one — it exists so the tokens can be seen rendering on a device.
export default function App() {
    const fontsLoaded = useAppFonts();
    if (!fontsLoaded) return <View style={styles.screen} />;

    return (
        <View style={[styles.screen, styles.center]}>
            <Text variant="eyebrow" tone="muted">
                Design tokens
            </Text>
            <Text variant="title">Mawid</Text>
            <Text variant="body" tone="ink2">
                Instrument Sans · DM Mono · Noto Naskh Arabic
            </Text>
            <Text variant="headline">عيادة الأسنان</Text>

            <View style={styles.card}>
                <Text variant="subhead" tone="muted">
                    Outstanding
                </Text>
                <Text variant="amount" tone="due">
                    EGP 2,600
                </Text>
            </View>

            <View style={styles.primary}>
                <Text variant="headline" tone="inverse">
                    Primary
                </Text>
            </View>

            {/* due and danger side by side — the split is only worth having if it
                reads at a glance on a real screen. */}
            <View style={styles.destructive}>
                <Text variant="headline" tone="danger">
                    Deactivate
                </Text>
            </View>

            <View style={styles.chips}>
                <View style={[styles.chip, { backgroundColor: color.dueSoft }]}>
                    <Text variant="tag" tone="due">
                        Due
                    </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: color.dangerSoft }]}>
                    <Text variant="tag" tone="danger">
                        Danger
                    </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: color.successSoft }]}>
                    <Text variant="tag" tone="success">
                        Settled
                    </Text>
                </View>
            </View>

            <StatusBar style="dark" />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    center: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[4],
        paddingHorizontal: size.gutter,
    },
    card: {
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: size.row,
        padding: space[4],
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
        boxShadow: shadow.card,
    },
    primary: {
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        height: size.button,
        borderRadius: radius.full,
        backgroundColor: color.accent,
        boxShadow: shadow.fab,
    },
    destructive: {
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        height: size.button,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: color.danger,
    },
    chips: { alignSelf: 'stretch', flexDirection: 'row', gap: space[2] },
    chip: { flex: 1, alignItems: 'center', paddingVertical: space[2], borderRadius: radius.md },
});
