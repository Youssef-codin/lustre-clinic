/**
 * The Lustre Clinic mark. Three forms. `mark` is the bare L and `lockup` adds
 * the wordmark — both redraw the master outline from `assets/brand/`, because a
 * badge a few points wide has to take its tone from the theme to stay legible
 * when the surface inverts, which an imported file cannot do.
 *
 * `clinic` is the primary colour logo, and it is the asset itself:
 * `assets/brand/lustre-clinic-logo.svg` imported through the Metro transformer
 * (see metro.config.js), gradient, blue CLINIC and all. It is fixed-colour by
 * definition — the brand's own values, not the theme's — so it belongs on a
 * light ground only, where the product is introducing itself rather than
 * labelling a screen. `tone` does not apply to it.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import ClinicLogo from '../../../assets/brand/lustre-clinic-logo.svg';
import { color, space, Text } from '../../theme';

export type BrandMarkProps = {
    variant?: 'mark' | 'lockup' | 'clinic';
    /** Cap height of the L in points. The wordmark scales with it. */
    size?: number;
    tone?: 'ink' | 'muted' | 'inverse';
};

/** Master outline, viewBox 0 0 100 118. Kept in sync with lustre-mark-L.svg. */
const MARK_PATH =
    'M42 2 L64 0 C53 30 40 70 34 94 Q33 103 43 103 L96 103 L100 118 L8 118 C1 118 -1 113 1 107 C7 74 25 32 42 2 Z';

/** The logo's own viewBox, 250 × 78 — the ratio the height scales by. */
const CLINIC_RATIO = 250 / 78;

const TONE = {
    ink: color.ink,
    muted: color.muted,
    inverse: color.inverse,
} as const;

export function BrandMark({ variant = 'mark', size = 16, tone = 'ink' }: BrandMarkProps) {
    if (variant === 'clinic') {
        // Height-driven like the other two, so a caller passing `size` gets a
        // mark of the same optical weight whichever variant it asked for.
        const height = size * 2.4;
        return (
            <ClinicLogo
                width={height * CLINIC_RATIO}
                height={height}
                accessibilityRole="image"
                accessibilityLabel="Lustre Clinic"
            />
        );
    }

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
