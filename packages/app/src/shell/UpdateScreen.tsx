import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
// biome-ignore lint/style/noRestrictedImports: follows the native updater, and AppState for the return to the app
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { ProgressBar } from '../components/ui';
import { useT } from '../i18n';
import { color, radius, space, Text } from '../theme';
import { awayLongEnough, isMinorUpdate, manifestVersion, reloadOnReturn } from './updateGate';

// A minor OTA update, taken over the whole screen (`updateGate.ts` says which).
// expo-updates checks on every launch and downloads in the background
// (`app.config.ts`); this only watches it. While a minor one downloads it
// covers the app with its progress, and once it is on the phone it restarts
// into it, so nobody has to close and reopen the app until it takes.
//
// A patch never takes the screen. It runs when the app comes back after being
// away a while (`useUpdateOnReturn`), which is also when a phone nobody ever
// closes looks for the next one.
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

    useUpdateOnReturn(isUpdatePending);

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

/**
 * Coming back to the app after `RELOAD_AFTER_AWAY_MS` or more: restart into an
 * update that has already downloaded, or else look for one. expo-updates only
 * checks on a cold start, and Android keeps a clinic phone's app alive for
 * days, so without this a phone that is never swiped away never hears of an
 * update at all. A shorter trip away, such as the reminders' hop to WhatsApp,
 * does nothing.
 */
function useUpdateOnReturn(updatePending: boolean) {
    const pending = useRef(updatePending);
    pending.current = updatePending;

    useEffect(() => {
        if (!Updates.isEnabled) return;
        let awaySince: number | null = null;

        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') {
                awaySince ??= Date.now();
                return;
            }
            const away = awaySince === null ? null : Date.now() - awaySince;
            awaySince = null;
            if (reloadOnReturn(pending.current, away)) {
                void Updates.reloadAsync().catch(() => undefined);
            } else if (awayLongEnough(away)) {
                // Downloads in the background; a minor then takes the screen
                // above, and a patch runs on the next return like this one.
                void Updates.checkForUpdateAsync()
                    .then((check) => (check.isAvailable ? Updates.fetchUpdateAsync() : undefined))
                    .catch(() => undefined);
            }
        });
        return () => subscription.remove();
    }, []);
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
