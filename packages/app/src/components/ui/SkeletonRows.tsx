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
 *
 * `ruled` is the second ground a list stands on. The default is a card, because
 * most panes are cards. A register that runs edge to edge — the patients list —
 * is page-coloured and hairline-ruled instead, and a skeleton that draws a card
 * where the rows will not be moves the whole list sideways when the answer
 * lands. `gutter` is the inset those rows keep.
 */
import { StyleSheet, View } from 'react-native';
import { border, color, radius, size, space } from '../../theme';
import { Card, CardDivider } from './Card';

export type SkeletonRowsProps = {
    count?: number;
    trailing?: boolean;
    ruled?: boolean;
    gutter?: number;
};

export function SkeletonRows({
    count = 3,
    trailing = false,
    ruled = false,
    gutter = space[4],
}: SkeletonRowsProps) {
    // Keyed by position, since placeholder rows have no id of their own. Built
    // from `count` rather than sliced out of a fixed table, which silently
    // capped a longer list at the table's length.
    const keys = Array.from({ length: Math.max(0, count) }, (_, index) => `skeleton-${index}`);

    const rows = keys.map((key, index) => (
        <View key={key} style={ruled ? styles.ruled : undefined}>
            {!ruled && index > 0 ? <CardDivider /> : null}
            <View style={[styles.row, { paddingHorizontal: gutter }]}>
                <View style={styles.lines}>
                    <View style={[styles.bar, styles.primary, ruled && index % 2 === 0 && styles.wide]} />
                    <View style={[styles.bar, styles.secondary]} />
                </View>
                {trailing ? <View style={[styles.bar, styles.value]} /> : null}
            </View>
        </View>
    ));

    if (ruled) {
        return (
            <View accessibilityLabel="Loading" accessibilityRole="progressbar">
                {rows}
            </View>
        );
    }

    return (
        <Card accessibilityLabel="Loading" accessibilityRole="progressbar">
            {rows}
        </Card>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[3],
    },
    ruled: {
        backgroundColor: color.canvas,
        borderTopWidth: border.hair,
        borderTopColor: color.hair,
    },
    lines: { flex: 1, gap: space[1.5] },
    bar: { height: 10, borderRadius: radius.sm, backgroundColor: color.surface2 },
    primary: { width: '52%' },
    wide: { width: '68%' },
    secondary: { width: '34%', height: 8 },
    value: { width: 64 },
});
