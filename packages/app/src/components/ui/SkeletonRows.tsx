/**
 * The shape of a list that has not arrived yet (§7.14). A skeleton rather than a
 * spinner because the list has a known shape — rows of fixed height at a fixed
 * inset — so nothing jumps when the answer lands.
 *
 * It does not shimmer. An animated sweep needs a gradient dependency the app
 * does not have, and pulsing eight rows costs frames on the clinic's Android for
 * no information the static blocks do not already give. Static grey bars are the
 * starting point; if a shimmer is ever added it is added here and every list
 * gets it at once.
 *
 * `trailing` is the second column a row can carry — a balance, a count, a price.
 * Off by default: most lists are two lines of text and nothing else, and a bar
 * standing where no value will land reads as a column the list does not have.
 */
import { StyleSheet, View } from 'react-native';
import { color, radius, size, space } from '../../theme';
import { Card, CardDivider } from './Card';

export type SkeletonRowsProps = {
    count?: number;
    trailing?: boolean;
};

export function SkeletonRows({ count = 3, trailing = false }: SkeletonRowsProps) {
    // Keyed by position, since placeholder rows have no id of their own. Built
    // from `count` rather than sliced out of a fixed table, which silently
    // capped a longer list at the table's length.
    const keys = Array.from({ length: Math.max(0, count) }, (_, index) => `skeleton-${index}`);

    return (
        <Card accessibilityLabel="Loading" accessibilityRole="progressbar">
            {keys.map((key, index) => (
                <View key={key}>
                    {index > 0 ? <CardDivider /> : null}
                    <View style={styles.row}>
                        <View style={styles.lines}>
                            <View style={[styles.bar, styles.primary]} />
                            <View style={[styles.bar, styles.secondary]} />
                        </View>
                        {trailing ? <View style={[styles.bar, styles.value]} /> : null}
                    </View>
                </View>
            ))}
        </Card>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[3],
        paddingHorizontal: space[4],
    },
    lines: { flex: 1, gap: space[1.5] },
    bar: { height: 10, borderRadius: radius.sm, backgroundColor: color.surface2 },
    primary: { width: '52%' },
    secondary: { width: '34%', height: 8 },
    value: { width: 64 },
});
