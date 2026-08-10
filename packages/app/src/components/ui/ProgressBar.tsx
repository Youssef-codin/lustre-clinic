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
    trackLight: { backgroundColor: color.surface2 },
    trackDark: { backgroundColor: color.ink2 },
    fill: { height: '100%' },
});
