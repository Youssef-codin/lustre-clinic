import type { CopyVars } from '@lustre/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { allowsLan, BUILD_VARIANT, useConnection } from '../api';
import { Button } from '../components/ui';
import { useT } from '../i18n';
import { color, radius, space, Text } from '../theme';
import { requestReconfigure } from './serverStore';

// The one screen with nothing on it (SPEC §7.14). When the clinic server does
// not answer there is no honest thing to draw — every list is a cache of a
// number that may already have changed — so the shell hands the whole surface
// over here: no tab bar, no headers, nothing tappable except Try again. It is
// deliberately a dead end. The alternative, a banner over a live-looking app,
// is how a secretary books onto a slot that was taken an hour ago.
export function OfflineScreen() {
    const t = useT();
    const { retry, lastOnlineAt } = useConnection();
    const [retrying, setRetrying] = useState(false);

    async function tryAgain() {
        setRetrying(true);
        try {
            await retry();
        } finally {
            setRetrying(false);
        }
    }

    return (
        <View style={styles.root}>
            <View style={styles.card}>
                <View style={styles.glyph}>
                    <Text variant="title2" tone="muted">
                        {'!'}
                    </Text>
                </View>

                <Text variant="title3">{t('No connection to the clinic')}</Text>
                <Text variant="subhead" tone="muted" style={styles.body}>
                    {t(
                        allowsLan(BUILD_VARIANT)
                            ? 'The app cannot reach the clinic computer. Check that you are on the clinic wifi or Tailscale, then try again.'
                            : 'The app cannot reach the clinic computer. Check that you are signed in to Tailscale, then try again.',
                    )}
                </Text>

                <Button
                    label="Try again"
                    onPress={tryAgain}
                    loading={retrying}
                    variant="primary"
                    size="lg"
                    block
                    style={styles.action}
                />

                <Text variant="caption" tone="muted">
                    {lastOnlineAt
                        ? t('Last connected {when}', { when: formatLastOnline(lastOnlineAt, t) })
                        : t('Never connected')}
                </Text>

                {/* The only other way out. A saved address that is wrong fails
                    identically to a clinic PC that is off, and Try again can
                    never fix the first one. */}
                <Button
                    label="Change server address"
                    onPress={requestReconfigure}
                    variant="text"
                    size="md"
                    style={styles.reconfigure}
                />
            </View>
        </View>
    );
}

// Coarse on purpose: the exact minute is noise, and the only question being
// answered is "was this a moment ago, or is this stale?".
function formatLastOnline(at: number, t: (copy: string, vars?: CopyVars) => string): string {
    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1) return t('just now');
    if (minutes < 60) return t('{minutes} min ago', { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? t('1 hour ago') : t('{hours} hours ago', { hours });
    const days = Math.floor(hours / 24);
    return days === 1 ? t('yesterday') : t('{days} days ago', { days });
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
    action: { marginTop: space[4], marginBottom: space[2] },
    // `Button` bases at `alignSelf: 'flex-start'`, which opts it out of the
    // card's centring — every other child here is centred by the parent.
    reconfigure: { marginTop: space[2], alignSelf: 'center' },
});
