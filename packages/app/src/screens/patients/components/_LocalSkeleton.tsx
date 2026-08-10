// `_Local` per §10: §7.14 asks for list loading skeletons and none are designed
// yet, so this is the cluster's placeholder. A skeleton, not a spinner, because
// the list has a known shape — rows of fixed height at a fixed inset — so the
// screen does not jump when the answer lands. It does not animate: a shimmer
// needs a gradient dependency the app does not have, and pulsing eight rows
// costs frames on the clinic's Android for no information the static blocks do
// not already give.
import { StyleSheet, View } from 'react-native';
import { color, radius, size, space } from '../../../theme';

export type SkeletonRowsProps = {
    count?: number;
    gutter?: number;
};

const KEYS = Array.from({ length: 12 }, (_, index) => `skeleton-${index}`);

export function SkeletonRows({ count = 6, gutter = size.gutter }: SkeletonRowsProps) {
    return (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading">
            {KEYS.slice(0, count).map((key, index) => (
                <View key={key} style={[styles.row, { paddingHorizontal: gutter }]}>
                    <View style={styles.text}>
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
