import { StyleSheet, View } from 'react-native';
import { color, radius, size, space } from '../../../theme';

/**
 * `_Local` per §10: §7.14 asks for list loading skeletons and none are designed
 * yet, so this is the cluster's placeholder rather than an invented shared
 * component. Noted in `BLOCKED.md`.
 *
 * A skeleton, not a spinner, because the list it stands in for has a known
 * shape: rows of a fixed height at a fixed inset. The screen does not jump when
 * the answer lands, which a centred spinner guarantees it will.
 *
 * It does not animate. A shimmer needs a gradient dependency the app does not
 * have, and a pulse on eight rows is the kind of thing that costs frames on the
 * cheap Android the clinic actually uses — for no information the static blocks
 * do not already give.
 */

export type SkeletonRowsProps = {
    count?: number;
    /** Matches `_LocalPatientRow`'s inset; `space[4]` matches a card's. */
    gutter?: number;
};

/** Stable keys — the rows are identical and never reorder. */
const KEYS = Array.from({ length: 12 }, (_, index) => `skeleton-${index}`);

export function SkeletonRows({ count = 6, gutter = size.gutter }: SkeletonRowsProps) {
    return (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading">
            {KEYS.slice(0, count).map((key, index) => (
                <View key={key} style={[styles.row, { paddingHorizontal: gutter }]}>
                    <View style={styles.text}>
                        {/* Two lines, long then short, so the block reads as a
                            name over a meta line rather than as a grey bar. */}
                        <View style={[styles.block, styles.primary, index % 2 === 0 && styles.wide]} />
                        <View style={[styles.block, styles.secondary]} />
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        minHeight: size.row + space[4],
        justifyContent: 'center',
        paddingVertical: space[2.5],
        backgroundColor: color.surface,
    },
    text: { gap: space[2] },
    block: { backgroundColor: color.surface2, borderRadius: radius.sm },
    primary: { height: 14, width: '52%' },
    wide: { width: '68%' },
    secondary: { height: 11, width: '38%' },
});
