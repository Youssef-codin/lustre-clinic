import { StyleSheet, View } from 'react-native';
import { color, radius } from '../../theme';

export type ProgressTone = 'accent' | 'success' | 'due' | 'live' | 'ink';

export type ProgressBarProps = {
    /** 0–1. Values outside the range are clamped rather than overflowing the track. */
    value: number;
    tone?: ProgressTone;
    height?: number;
    /** Inside a black card the track has to be light, not `surface2`. */
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
    trackLight: { backgroundColor: color.surface2 },
    trackDark: { backgroundColor: color.ink2 },
    fill: { height: '100%' },
});
