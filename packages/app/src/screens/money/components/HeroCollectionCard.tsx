// The black collection-rate card at the top of the money screen. Every figure
// comes from `balance.summary` exactly as the server computed it — no amount is
// added, subtracted or rounded here. The rate is a ratio, clamped to 0–1:
// charges sit on the visit's date while payments sit on the day money arrived,
// so a day that settles old debt can collect more than it charged; the surplus
// is reported as "collected ahead" rather than as a rate above 100%.
//
// The whites are `inverse` at an opacity, because `muted` is a grey tuned for
// white grounds and disappears on black. The rules, the track and the two
// tinted figures are tokens instead: an opacity on the card would dim its
// contents with it.
import { StyleSheet, View } from 'react-native';
import { color, gradient, radius, shadow, space, Text } from '../../../theme';
import type { BalanceSummary } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { amountStillDue, collectedAhead, collectionRate } from '../money';

const BAR_HEIGHT = 16;
const DOT = 8;

export type HeroCollectionCardProps = {
    summary: BalanceSummary;
    dueLabel: string;
    /** Set by the screen so the card's bottom edge lands mid-screen. */
    minHeight: number;
};

export function HeroCollectionCard({ summary, dueLabel, minHeight }: HeroCollectionCardProps) {
    const { charged, collected, difference, duePatients } = summary;

    const rate = collectionRate(charged, collected);
    const percent = Math.round(rate * 100);

    const stillDue = amountStillDue(difference);
    const ahead = collectedAhead(difference);

    // Everything charged was collected, or nothing was charged at all — the
    // two ways a period ends up owing nothing.
    const settled = stillDue === 0 && ahead === 0;

    return (
        <View style={[styles.card, { minHeight }]} testID="money-hero">
            <Text variant="eyebrow" script="sans" weight="bold" tone="inverse" style={styles.dim}>
                Collection rate
            </Text>

            <View style={styles.figure}>
                <View style={styles.rate}>
                    <Text variant="hero" tone="inverse">
                        {String(percent)}
                    </Text>
                    <Text variant="figure2" script="sans" weight="bold" tone="inverse" style={styles.unit}>
                        %
                    </Text>
                </View>

                <View style={styles.due}>
                    <Text variant="caption" script="sans" weight="bold" tone="inverse" style={styles.dim}>
                        {settled ? 'Nothing due' : ahead > 0 ? 'Collected ahead' : dueLabel}
                    </Text>

                    {/* Nothing owed means there is no figure to draw: the
                        amount would be a zero and the count a zero beside it,
                        under a caption saying money is due. A period that
                        charged nothing lands here too, which is every "Today"
                        before the first visit is billed. */}
                    {settled ? null : (
                        // One text flow, not two flex children: as a row the
                        // tail is a sibling that can be dropped when the figure
                        // is wide, and "· 12" is a worse lie than a wrapped line.
                        <Text variant="body" weight="bold" tone="inverse">
                            <MoneyValue
                                amount={ahead > 0 ? ahead : stillDue}
                                variant="body"
                                weight="bold"
                                tone="inverse"
                                compact
                                showCurrency={false}
                            />
                            {/* The count belongs to the shortfall. Against a
                                surplus it would be counting the wrong thing. */}
                            {ahead > 0 ? null : (
                                <Text variant="body" weight="semibold" tone="inverse" style={styles.faint}>
                                    {` · ${duePatients} ${duePatients === 1 ? 'patient' : 'patients'}`}
                                </Text>
                            )}
                        </Text>
                    )}
                </View>
            </View>

            <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityLabel="Collected against charged"
                accessibilityValue={{ min: 0, max: 100, now: percent }}
            >
                <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>

            <View style={styles.stats}>
                <HeroStat
                    label="Collected"
                    amount={collected}
                    tone="successOnDark"
                    dot={color.successOnDark}
                />
                <HeroStat label="Charged" amount={charged} tone="inverse" dot={color.onDarkMuted} dim />
                <HeroStat label="Due" amount={stillDue} tone="dueOnDark" dot={color.dueOnDark} last />
            </View>
        </View>
    );
}

function HeroStat({
    label,
    amount,
    tone,
    dot,
    dim = false,
    last = false,
}: {
    label: string;
    amount: number;
    tone: 'successOnDark' | 'dueOnDark' | 'inverse';
    dot: string;
    dim?: boolean;
    last?: boolean;
}) {
    return (
        <View style={[styles.stat, last && styles.statLast]}>
            <View style={styles.statLabel}>
                <View style={[styles.dot, { backgroundColor: dot }]} />
                <Text variant="tag" script="sans" weight="bold" tone="inverse" style={styles.label}>
                    {label}
                </Text>
            </View>

            <MoneyValue
                amount={amount}
                variant="amount"
                currencyVariant="tag"
                tone={tone}
                compact
                currencySuffix
                currencyStyle={styles.faint}
                style={dim ? styles.chargedValue : undefined}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        alignSelf: 'stretch',
        // `gap` is the floor and `space-between` spends whatever height the
        // screen handed down, so the four blocks breathe on a tall phone and
        // stay legible on a short one without a second set of numbers.
        justifyContent: 'space-between',
        gap: space[4],
        paddingVertical: space[6],
        paddingHorizontal: space[6],
        borderRadius: radius.xl4,
        backgroundColor: color.inkDeep,
        experimental_backgroundImage: gradient.hero,
        boxShadow: shadow.hero,
    },
    dim: { opacity: 0.62 },
    faint: { opacity: 0.5 },
    label: { opacity: 0.58 },
    unit: { opacity: 0.6, marginTop: space[2], marginStart: space[1] },

    figure: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3.5] },
    rate: { flexDirection: 'row', alignItems: 'flex-start' },
    due: { flex: 1, alignItems: 'flex-end', gap: space[0.5], paddingBottom: space[1.5] },

    track: {
        height: BAR_HEIGHT,
        borderRadius: radius.full,
        overflow: 'hidden',
        backgroundColor: color.onDarkTrack,
    },
    fill: { height: '100%', borderRadius: radius.full, backgroundColor: color.live },

    stats: { borderTopWidth: 1, borderTopColor: color.onDarkLine },
    stat: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        paddingVertical: space[2.5],
        borderBottomWidth: 1,
        borderBottomColor: color.onDarkHair,
    },
    statLast: { paddingBottom: 0, borderBottomWidth: 0 },
    statLabel: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    dot: { width: DOT, height: DOT, borderRadius: 3 },
    chargedValue: { opacity: 0.72 },
});
