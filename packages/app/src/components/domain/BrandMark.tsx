/**
 * The Lustre Clinic mark. Two forms, both drawn from the same master outline in
 * `assets/brand/lustre-mark-L.svg` — edit the beziers there and mirror them here,
 * never trace a copy. `mark` is the bare L, for the header slot where the space
 * is a few points wide. `lockup` adds the wordmark for surfaces that have room.
 *
 * The L is brand, not chrome: it takes the ink tone from the theme rather than
 * the SVG's own #14110F so it stays legible if the surface inverts.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, space, Text } from '../../theme';

export type BrandMarkProps = {
    variant?: 'mark' | 'lockup';
    /** Cap height of the L in points. The wordmark scales with it. */
    size?: number;
    tone?: 'ink' | 'muted' | 'inverse';
};

/** Master outline, viewBox 0 0 100 118. Kept in sync with lustre-mark-L.svg. */
const MARK_PATH =
    'M42 2 L64 0 C53 30 40 70 34 94 Q33 103 43 103 L96 103 L100 118 L8 118 C1 118 -1 113 1 107 C7 74 25 32 42 2 Z';

const TONE = {
    ink: color.ink,
    muted: color.muted,
    inverse: color.inverse,
} as const;

export function BrandMark({ variant = 'mark', size = 16, tone = 'ink' }: BrandMarkProps) {
    const fill = TONE[tone];
    const glyph = (
        <Svg width={(size * 100) / 118} height={size} viewBox="0 0 100 118">
            <Path d={MARK_PATH} fill={fill} />
        </Svg>
    );

    if (variant === 'mark') {
        return glyph;
    }

    return (
        <View style={styles.lockup} accessibilityRole="image" accessibilityLabel="Lustre Clinic">
            {glyph}
            <Text variant="eyebrow" tone={tone} style={styles.word}>
                USTRE
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    lockup: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    // The wordmark's tracking is part of the mark, not a type choice.
    word: { letterSpacing: 3 },
});
