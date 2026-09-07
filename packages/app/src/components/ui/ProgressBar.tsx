/**
 * The track is `outline`, not `surface2`. `surface2` (#f0f0f3) on `canvas`
 * (#f4f4f6) is four values apart and effectively invisible, and the empty bar
 * is the case that matters: at `0 of 4` the track *is* the whole control, with
 * no fill to infer it from, so a vanishing track takes the "four to go" signal
 * with it. `outline` is what every other hairline on `canvas` already uses, and
 * it holds on `surface` too.
 *
 * The fill eases to a new `value` rather than jumping, so a change reads as an
 * event instead of as the screen having always looked that way. `width` is a
 * layout property, which means this animation cannot use the native driver —
 * and nothing else may be animated on this node with it. Putting a native
 * `opacity` on the same view hands the node to the native driver, after which
 * the width tween throws `animated node that has been moved to "native"`.
 */
// biome-ignore lint/style/noRestrictedImports: an `Animated.timing` driven imperatively — the fill chases a prop and the tween has to be stopped on cleanup
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { color, radius } from '../../theme';
import { easing, duration as motionDuration } from './motion';
import { useReducedMotion } from './useReducedMotion';

export type ProgressTone = 'accent' | 'success' | 'due' | 'live' | 'ink';

export type ProgressBarProps = {
    value: number;
    tone?: ProgressTone;
    height?: number;
    onDark?: boolean;
    accessibilityLabel?: string;
};

const TONE: Record<ProgressTone, string> = {
    accent: color.accent,
    success: color.success,
    due: color.due,
    live: color.live,
    ink: color.ink,
};

export function ProgressBar({
    value,
    tone = 'accent',
    height = 3,
    onDark = false,
    accessibilityLabel,
}: ProgressBarProps) {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    const reducedMotion = useReducedMotion();
    const filled = useRef(new Animated.Value(clamped)).current;

    useEffect(() => {
        if (reducedMotion) {
            filled.setValue(clamped);
            return;
        }
        const tween = Animated.timing(filled, {
            toValue: clamped,
            duration: motionDuration.fadeup,
            easing: easing.standard,
            useNativeDriver: false,
        });
        tween.start();
        return () => tween.stop();
    }, [clamped, reducedMotion, filled]);

    const width = filled.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
            style={[
                styles.track,
                { height, borderRadius: height },
                onDark ? styles.trackDark : styles.trackLight,
            ]}
        >
            <Animated.View
                style={[styles.fill, { width, backgroundColor: TONE[tone], borderRadius: height }]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    track: { alignSelf: 'stretch', overflow: 'hidden', borderRadius: radius.full },
    trackLight: { backgroundColor: color.outline },
    trackDark: { backgroundColor: color.ink2 },
    fill: { height: '100%' },
});
