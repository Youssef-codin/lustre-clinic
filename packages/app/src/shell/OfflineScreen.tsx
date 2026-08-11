import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useConnection } from '../api';
import { Button } from '../components/ui';
import { color, radius, space, Text } from '../theme';

// The one screen with nothing on it (SPEC §7.14). When the clinic server does
// not answer there is no honest thing to draw — every list is a cache of a
// number that may already have changed — so the shell hands the whole surface
// over here: no tab bar, no headers, nothing tappable except Try again. It is
// deliberately a dead end. The alternative, a banner over a live-looking app,
// is how a secretary books onto a slot that was taken an hour ago.
export function OfflineScreen() {
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

                <Text variant="title3">No connection to the clinic</Text>
                <Text variant="subhead" tone="muted" style={styles.body}>
                    The app cannot reach the clinic computer. Check that you are on the clinic wifi or
                    Tailscale, then try again.
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
                    {lastOnlineAt ? `Last connected ${formatLastOnline(lastOnlineAt)}` : 'Never connected'}
                </Text>
            </View>
        </View>
    );
}

// Coarse on purpose: the exact minute is noise, and the only question being
// answered is "was this a moment ago, or is this stale?".
function formatLastOnline(at: number): string {
    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
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
});
