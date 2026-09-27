import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Refusal, retryProvisioning } from '../api';
import { GLYPH } from '../components/domain';
import { Button, PushView, useHardwareBack } from '../components/ui';
import { useT } from '../i18n';
import { ScanCodeScreen } from '../screens/settings';
import { color, radius, space, Text } from '../theme';

// The shell's third route beside the app and offline: the server answered and
// would not let this phone in. Like the offline screen it is a dead end with
// one way out — here, an admin's code. Behind it nothing is drawn, because
// everything behind it would be a screen of refusals.
//
// Revoked is kept across launches (`api/credential`), so a phone an admin shut
// out does not drift back in on the access a phone with no role still has.
// Unprovisioned is not: the clinic turning the requirement off again has to be
// enough, and Try again is how this phone finds out.
export function ProvisionScreen({ refusal }: { refusal: Exclude<Refusal, 'none'> }) {
    const t = useT();
    const [scanning, setScanning] = useState(false);
    // The shell hands the hardware back to the launcher on this route; the
    // scanner over it is the one thing back should close first.
    useHardwareBack(scanning, () => {
        setScanning(false);
        return true;
    });

    return (
        <View style={styles.root}>
            <View style={styles.card}>
                <View style={styles.glyph}>
                    <GLYPH.scanCode size={22} color={color.ink2} strokeWidth={2} />
                </View>

                <Text variant="title3">
                    {t(
                        refusal === 'revoked'
                            ? 'This phone’s role was withdrawn'
                            : 'This phone needs a role code',
                    )}
                </Text>
                <Text variant="subhead" tone="muted" style={styles.body}>
                    {t(
                        refusal === 'revoked'
                            ? 'An admin withdrew the role this phone had. Ask them for a new code, then scan it.'
                            : 'The clinic now asks every phone for a role code. Ask the admin for one, then scan it.',
                    )}
                </Text>

                <Button
                    label="Scan a role code"
                    onPress={() => setScanning(true)}
                    variant="primary"
                    size="lg"
                    block
                    style={styles.action}
                    testID="provision-scan"
                />

                {refusal === 'unprovisioned' ? (
                    <Button
                        label="Try again"
                        onPress={retryProvisioning}
                        variant="text"
                        size="md"
                        style={styles.retry}
                        testID="provision-retry"
                    />
                ) : null}
            </View>

            <PushView visible={scanning} testID="provision-scan-pane">
                <ScanCodeScreen onBack={() => setScanning(false)} onGranted={() => setScanning(false)} />
            </PushView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: color.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space[5],
    },
    card: {
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space[8],
        paddingHorizontal: space[5],
        borderRadius: radius.xl2,
        backgroundColor: color.surface,
    },
    glyph: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space[1],
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: color.line,
    },
    body: { textAlign: 'center' },
    action: { marginTop: space[4] },
    retry: { marginTop: space[2], alignSelf: 'center' },
});
