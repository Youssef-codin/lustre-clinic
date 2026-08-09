import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TextTone } from '../../theme';
import { color, size, space, Text } from '../../theme';
import { Dot } from './Dot';

export type BannerTone = 'offline' | 'warning' | 'info' | 'success';

export type BannerProps = {
    tone?: BannerTone;
    message: string;
    /** A Retry, usually. Given as a node so the caller owns its loading state. */
    action?: ReactNode;
    /** Pulses the dot — a live condition rather than a settled one. */
    live?: boolean;
};

const GROUND: Record<BannerTone, string> = {
    offline: color.ink,
    warning: color.dueSoft,
    info: color.canvas,
    success: color.successSoft,
};

const TEXT: Record<BannerTone, TextTone> = {
    offline: 'inverse',
    warning: 'due',
    info: 'ink2',
    success: 'success',
};

/**
 * Screen-level strip. The offline one is the only banner the designs draw, and
 * §7.14 says one banner is not enough for a clinic-local server over Tailscale —
 * stale data and failed writes need their own, which is why this takes a tone
 * rather than being `OfflineBanner`.
 */
export function Banner({ tone = 'info', message, action, live = false }: BannerProps) {
    return (
        <View accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: GROUND[tone] }]}>
            <Dot tone={tone === 'offline' ? 'due' : tone === 'success' ? 'success' : 'due'} pulse={live} />
            <Text variant="subhead" tone={TEXT[tone]} style={styles.message}>
                {message}
            </Text>
            {action}
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        gap: space[2.5],
        minHeight: size.row,
        paddingHorizontal: size.gutter,
        paddingVertical: space[2],
    },
    message: { flex: 1 },
});
