import { StyleSheet, View } from 'react-native';
import { Dot } from '../../../components/ui';
import { color, radius, space, Text } from '../../../theme';
import type { BalanceSummary } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';

// Inventory §5 `domain/HeroCollectionCard` — the black card at the top of the
// money screen: a collection rate, a caption, a split bar, and three stats with
// colour-coded dots.
//
// Every figure here comes from `balance.summary` as the server computed it. The
// one derived number is the rate, which is a ratio of two amounts and not an
// amount — no money is added, subtracted or rounded on this screen.
//
// The `older` and `discount` variants in the export's CSS are not built: neither
// has a rule saying when it applies (BLOCKED.md #9).

const BAR_HEIGHT = 6;

export type HeroCollectionCardProps = {
    summary: BalanceSummary;
    /** Names the period the figures cover, so the card is never ambiguous. */
    periodLabel: string;
};

export function HeroCollectionCard({ summary, periodLabel }: HeroCollectionCardProps) {
    const { charged, collected, difference } = summary;

    // A ratio, not money. Nothing was charged means nothing was missed, so the
    // rate reads 100% rather than dividing by zero.
    const rate = charged > 0 ? collected / charged : 1;
    const percent = Math.round(rate * 100);

    return (
        <View style={styles.card} testID="money-hero">
            <Text variant="eyebrow" tone="inverse" style={styles.dim}>
                {`Collection rate · ${periodLabel}`}
            </Text>

            <Text variant="display" tone="inverse">
                {`${percent}%`}
            </Text>

            <View style={styles.caption}>
                {difference > 0 ? (
                    <>
                        <MoneyValue
                            amount={difference}
                            variant="subhead"
                            tone="inverse"
                            weight="medium"
                            compact
                        />
                        <Text variant="subhead" tone="inverse" style={styles.dim}>
                            still to collect
                        </Text>
                    </>
                ) : (
                    <Text variant="subhead" tone="inverse" style={styles.dim}>
                        Everything charged has been collected
                    </Text>
                )}
            </View>

            <View
                style={styles.bar}
                accessibilityRole="progressbar"
                accessibilityLabel="Collected against charged"
                accessibilityValue={{ min: 0, max: 100, now: percent }}
            >
                {rate > 0 ? <View style={[styles.fill, styles.collectedFill, { flexGrow: rate }]} /> : null}
                {rate < 1 ? <View style={[styles.fill, styles.dueFill, { flexGrow: 1 - rate }]} /> : null}
            </View>

            <View style={styles.stats}>
                <HeroStat label="Collected" amount={collected} tone="success" />
                <HeroStat label="Charged" amount={charged} tone="muted" />
                <HeroStat label="Due" amount={difference} tone="due" />
            </View>
        </View>
    );
}

function HeroStat({
    label,
    amount,
    tone,
}: {
    label: string;
    amount: number;
    tone: 'success' | 'muted' | 'due';
}) {
    return (
        <View style={styles.stat}>
            <View style={styles.statLabel}>
                <Dot tone={tone} size={6} />
                <Text variant="caption" tone="inverse" style={styles.dim}>
                    {label}
                </Text>
            </View>
            <MoneyValue amount={amount} variant="callout" currencyVariant="caption" tone="inverse" compact />
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        alignSelf: 'stretch',
        gap: space[2],
        padding: space[5],
        borderRadius: radius.sheet,
        backgroundColor: color.ink,
    },
    // The only way to say "muted" on a black card: `muted` is a grey tuned for
    // white grounds and disappears here, and a second inverse token would be one
    // more colour to keep in step for one card.
    dim: { opacity: 0.62 },
    caption: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[1] },
    bar: {
        flexDirection: 'row',
        alignSelf: 'stretch',
        gap: 2,
        height: BAR_HEIGHT,
        marginTop: space[2],
    },
    fill: { flexBasis: 0, borderRadius: radius.full },
    collectedFill: { backgroundColor: color.successBright },
    dueFill: { backgroundColor: color.due },
    stats: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
    stat: { flex: 1, gap: space[1] },
    statLabel: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
