import { I18nManager, StyleSheet, View } from 'react-native';
import { color } from '../../theme';

export type ChevronDirection = 'forward' | 'back' | 'up' | 'down';

export type ChevronProps = {
    /** `forward` and `back` are inline — they mirror in Arabic. Up and down do not. */
    direction?: ChevronDirection;
    size?: number;
    tone?: 'muted' | 'ink' | 'inverse' | 'accent';
};

const TONE = {
    muted: color.muted,
    ink: color.ink,
    inverse: color.inverse,
    accent: color.accent,
} as const;

// Two borders on one box, rotated — the CSS chevron, which is what the designs
// use. `borderEndWidth` already flips in Arabic, so the rotation has to flip with
// it or the glyph ends up pointing at the ceiling.
const ROTATION: Record<ChevronDirection, [ltr: string, rtl: string]> = {
    forward: ['45deg', '-45deg'],
    back: ['-135deg', '135deg'],
    up: ['-45deg', '45deg'],
    down: ['135deg', '-135deg'],
};

export function Chevron({ direction = 'forward', size = 8, tone = 'muted' }: ChevronProps) {
    const [ltr, rtl] = ROTATION[direction];

    return (
        <View
            style={[
                styles.chevron,
                {
                    width: size,
                    height: size,
                    borderColor: TONE[tone],
                    transform: [{ rotate: I18nManager.isRTL ? rtl : ltr }],
                },
            ]}
        />
    );
}

const styles = StyleSheet.create({
    chevron: { borderTopWidth: 1.5, borderEndWidth: 1.5 },
});
