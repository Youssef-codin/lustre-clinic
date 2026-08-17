// A label / figure / sub stat card beneath the hero. Compact figures are
// allowed here and in the hero only (§7.12), and EGP rides after the figure as
// a unit rather than leading it as a currency mark — that is what the design
// draws and it is what keeps the two cards' figures on the same left edge.
import { StyleSheet, View } from 'react-native';
import { color, radius, space, Text } from '../../../theme';
import { MoneyValue } from '../_LocalMoneyValue';
import { SkeletonBlock } from './LoadState';

// Side by side inside the gutter these are about 195 wide, so the design's own
// height left them reading as letterboxes. The extra comes from the padding and
// a floor, not from spreading the three lines apart — the label, the figure and
// the sub are one block and stay one block.
const CARD_HEIGHT = 150;

export type StatTone = 'ink' | 'due' | 'older';

export type StatCardProps = {
    label: string;
    amount: number;
    sub?: string;
    tone?: StatTone;
    testID?: string;
};

export function StatCard({ label, amount, sub, tone = 'ink', testID }: StatCardProps) {
    return (
        <View style={styles.card} testID={testID}>
            <Text variant="eyebrow" script="sans" weight="bold" tone="muted">
                {label}
            </Text>

            <MoneyValue
                amount={amount}
                variant="figure2"
                currencyVariant="footnote"
                tone={tone}
                compact
                currencySuffix
                currencyStyle={styles.unit}
            />

            {sub ? (
                <Text variant="footnote" tone="muted">
                    {sub}
                </Text>
            ) : null}
        </View>
    );
}

// The same box as `StatCard`, down to the flex and the radius, with a block
// standing in for each of its three lines. Sharing `styles.card` is the point:
// a skeleton built out of a generic card sized itself and the pair jumped when
// the figures arrived.
export function StatCardSkeleton() {
    return (
        <View style={styles.card}>
            <SkeletonBlock width="62%" height={11} />
            <SkeletonBlock width="74%" height={26} />
            <SkeletonBlock width="52%" height={12} />
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flex: 1,
        justifyContent: 'center',
        gap: space[4],
        minHeight: CARD_HEIGHT,
        paddingVertical: space[6],
        paddingHorizontal: space[5],
        borderRadius: radius.xl3,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    unit: { opacity: 0.6 },
});
