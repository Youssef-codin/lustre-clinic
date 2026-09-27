import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
// biome-ignore lint/style/noRestrictedImports: follows the native updater, and AppState for the return to the app
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { ProgressBar } from '../components/ui';
import { useT } from '../i18n';
import { color, radius, space, Text } from '../theme';
import { CHECK_EVERY_MS, isMinorUpdate, manifestVersion, reloadOnReturn, updatesHeld } from './updateGate';

// A minor OTA update, taken over the whole screen (`updateGate.ts` says which).
// expo-updates checks on every launch and downloads in the background
// (`app.config.ts`); this only watches it. While a minor one downloads it
// covers the app with its progress, and once it is on the phone it restarts
// into it, so nobody has to close and reopen the app until it takes.
//
// A patch never takes the screen. It downloads quietly (`useQuietUpdates`) and
// runs the next time the app comes back on screen, from WhatsApp, from the
// lock screen, or reopened after being swiped away.
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

    useQuietUpdates(isUpdatePending);

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
 * Set once the root has drawn in this JavaScript context. Swiping the app away
 * does not end its process (the listener service keeps it), so opening it again
 * draws a new root in the same context instead of cold-starting, and the native
 * check on launch never runs. A second mount is that reopen, a return like any other.
 */
let drawnBefore = false;
let checking = false;
/** When the app was last opened or came back on screen. */
let returnedAt: number | null = null;

/** Looks for an update and downloads it, without a screen. A minor then takes the screen above. */
function fetchQuietly() {
    if (checking) return;
    checking = true;
    void Updates.checkForUpdateAsync()
        .then((check) => (check.isAvailable ? Updates.fetchUpdateAsync() : undefined))
        .catch(() => undefined)
        .finally(() => {
            checking = false;
        });
}

function reloadIfDue(updatePending: boolean) {
    const since = returnedAt === null ? null : Date.now() - returnedAt;
    if (reloadOnReturn(updatePending, since, updatesHeld()))
        void Updates.reloadAsync().catch(() => undefined);
}

function onReturn(updatePending: boolean) {
    returnedAt = Date.now();
    if (updatePending) reloadIfDue(updatePending);
    else fetchQuietly();
}

/**
 * Patches nobody has to close the app for. Every return to the app restarts it
 * into a downloaded patch, or else looks for one and restarts if it lands within
 * `RELOAD_WINDOW_MS`. An open app also looks every `CHECK_EVERY_MS`, so the patch
 * is usually waiting before the return: expo-updates on its own only checks on
 * a cold start, and a clinic phone rarely has one.
 */
function useQuietUpdates(updatePending: boolean) {
    const pending = useRef(updatePending);
    pending.current = updatePending;

    useEffect(() => {
        if (!Updates.isEnabled) return;
        // A cold start counts as a return too: it opens on the bundle it has and
        // downloads in the background, and one that lands straight away should
        // not wait for the next launch.
        if (drawnBefore) onReturn(pending.current);
        else returnedAt = Date.now();
        drawnBefore = true;

        let away = false;
        const timer = setInterval(fetchQuietly, CHECK_EVERY_MS);
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') {
                away = true;
            } else if (away) {
                away = false;
                onReturn(pending.current);
            }
        });
        return () => {
            clearInterval(timer);
            subscription.remove();
        };
    }, []);

    // A patch that lands in the moments after a return.
    useEffect(() => {
        if (Updates.isEnabled) reloadIfDue(updatePending);
    }, [updatePending]);
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
