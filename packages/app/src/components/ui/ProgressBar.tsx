/**
 * The track is `outline`, not `surface2`. `surface2` (#f0f0f3) on `canvas`
 * (#f4f4f6) is four values apart and effectively invisible, and the empty bar
 * is the case that matters: at `0 of 4` the track *is* the whole control, with
 * no fill to infer it from, so a vanishing track takes the "four to go" signal
 * with it. `outline` is what every other hairline on `canvas` already uses, and
 * it holds on `surface` too.
 */
import { StyleSheet, View } from 'react-native';
import { color, radius } from '../../theme';

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
            <View
                style={[
                    styles.fill,
                    { width: `${clamped * 100}%`, backgroundColor: TONE[tone], borderRadius: height },
                ]}
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
