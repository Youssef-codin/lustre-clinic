import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
// biome-ignore lint/style/noRestrictedImports: restarts when the native updater finishes a download
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar } from '../components/ui';
import { useT } from '../i18n';
import { color, radius, space, Text } from '../theme';
import { isMinorUpdate, manifestVersion } from './updateGate';

// A minor OTA update, taken over the whole screen (`updateGate.ts` says which).
// expo-updates checks on every launch and downloads in the background
// (`app.config.ts`); this only watches it. While a minor one downloads it
// covers the app with its progress, and once it is on the phone it restarts
// into it, so nobody has to close and reopen the app until it takes.
//
// A failed download gives the app back: the update is retried on the next
// launch, and a clinic phone on a bad connection is still a working register.
// Debug and demo builds have updates off, and `useUpdates` stays idle there.
export function UpdateScreen() {
    const t = useT();
    const {
        availableUpdate,
        downloadedUpdate,
        isDownloading,
        isUpdatePending,
        downloadProgress,
        downloadError,
    } = Updates.useUpdates();

    const incoming = manifestVersion((downloadedUpdate ?? availableUpdate)?.manifest);
    const minor = isMinorUpdate(Constants.expoConfig?.version, incoming);
    const restarting = minor && isUpdatePending;

    useEffect(() => {
        if (restarting) void Updates.reloadAsync().catch(() => undefined);
    }, [restarting]);

    if (!minor || downloadError || !(isDownloading || isUpdatePending)) return null;

    return (
        <View style={styles.root} testID="update-screen">
            <View style={styles.card}>
                <Text variant="title3">{t('Updating the app')}</Text>
                <Text variant="subhead" tone="muted" style={styles.body}>
                    {t(
                        restarting
                            ? 'Version {version} is ready. Restarting…'
                            : 'Downloading version {version}. The app restarts by itself when it is done.',
                        { version: incoming ?? '' },
                    )}
                </Text>
                <View style={styles.bar}>
                    <ProgressBar value={restarting ? 1 : (downloadProgress ?? 0)} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFill,
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
    body: { textAlign: 'center' },
    bar: { alignSelf: 'stretch', marginTop: space[4] },
});
