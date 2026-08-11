// The black collection-rate card at the top of the money screen. Every figure
// comes from `balance.summary` exactly as the server computed it — no amount is
// added, subtracted or rounded here. The rate is a ratio, clamped to 0–1:
// charges sit on the visit's date while payments sit on the day money arrived,
// so a day that settles old debt can collect more than it charged; the surplus
// is reported as "collected ahead". `dim` uses opacity rather than
// `tone="muted"`, which is a grey tuned for white grounds and disappears on
// black. The `older`/`discount` variants are not built (BLOCKED.md #9).
import { StyleSheet, View } from 'react-native';
import { Dot } from '../../../components/ui';
import { color, radius, space, Text } from '../../../theme';
import type { BalanceSummary } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { amountStillDue, collectedAhead, collectionRate } from '../money';

const BAR_HEIGHT = 6;

export type HeroCollectionCardProps = {
    summary: BalanceSummary;
    periodLabel: string;
};

export function HeroCollectionCard({ summary, periodLabel }: HeroCollectionCardProps) {
    const { charged, collected, difference } = summary;

    const rate = collectionRate(charged, collected);
    const percent = Math.round(rate * 100);

    const stillDue = amountStillDue(difference);
    const ahead = collectedAhead(difference);

    return (
        <View style={styles.card} testID="money-hero">
            <Text variant="eyebrow" tone="inverse" style={styles.dim}>
                {`Collection rate · ${periodLabel}`}
            </Text>

            <Text variant="display" tone="inverse">
                {`${percent}%`}
            </Text>

            <View style={styles.caption}>
                {stillDue > 0 ? (
                    <>
                        <MoneyValue
                            amount={stillDue}
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

            {ahead > 0 ? (
                <View style={styles.caption}>
                    <MoneyValue amount={ahead} variant="caption" tone="inverse" weight="medium" compact />
                    <Text variant="caption" tone="inverse" style={styles.dim}>
                        of it against earlier visits
                    </Text>
                </View>
            ) : null}

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
                <HeroStat label="Due" amount={stillDue} tone="due" />
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
