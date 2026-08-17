// A collected total and one row per payment method. The endpoint behind this
// does not exist yet (BLOCKED.md #5); the stub serves the shape. Amounts are
// full, never compact (§7.12). Each row's share is a ratio, not money — nothing
// is summed here, and the percentage is never rendered as an amount.
//
// The share label rides above the head of its own bar rather than sitting in a
// column: four bars of different lengths read as one comparison that way, and
// the caret is what ties a label to the bar it belongs to. It is positioned
// with `start`, not `left`, so it tracks the fill under RTL.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { duration, easing, useReducedMotion } from '../../../components/ui';
import { color, radius, space, Text } from '../../../theme';
import type { MethodTaking, TakingsReport } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { methodLabel } from '../format';
import { BankIcon, MethodIcon } from './icons';

const BAR_HEIGHT = 6;
const TILE = 32;
const CARET = 4;
const SHARE_LABEL = 44;

export type TakingsCardProps = {
    takings: TakingsReport;
    label: string;
};

export function TakingsCard({ takings, label }: TakingsCardProps) {
    const { total, byMethod } = takings;

    return (
        <View style={styles.card} testID="money-takings">
            <View style={styles.total}>
                <View style={styles.totalLabel}>
                    <Text variant="eyebrow" script="sans" weight="bold" tone="muted">
                        {label}
                    </Text>
                    <BankIcon />
                </View>

                <MoneyValue amount={total} variant="figure" currencyVariant="figure" tone="success" />
            </View>

            {total === 0 ? (
                <View style={styles.empty}>
                    <Text variant="subhead" tone="muted">
                        Nothing was collected in this period.
                    </Text>
                </View>
            ) : (
                <View style={styles.methods}>
                    {byMethod.map((row) => (
                        <MethodRow key={row.method} row={row} total={total} />
                    ))}
                </View>
            )}
        </View>
    );
}

function MethodRow({ row, total }: { row: MethodTaking; total: number }) {
    const share = total > 0 ? row.amount / total : 0;
    const percent = Math.round(share * 100);

    const width = useRef(new Animated.Value(0)).current;
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const animation = Animated.timing(width, {
            toValue: share,
            duration: reducedMotion ? 0 : duration.fadeup,
            easing: easing.standard,
            useNativeDriver: false,
        });

        animation.start();
        return () => animation.stop();
    }, [share, width, reducedMotion]);

    const other = row.method === 'other';

    return (
        <View style={styles.methodRow} testID={`money-method-${row.method}`}>
            <View style={styles.tile}>
                <MethodIcon method={row.method} />
            </View>

            <View style={styles.barCol}>
                <View
                    style={styles.track}
                    accessibilityRole="progressbar"
                    accessibilityLabel={`${methodLabel(row.method)} share of takings`}
                    accessibilityValue={{ min: 0, max: 100, now: percent }}
                >
                    <Animated.View
                        style={[
                            styles.fill,
                            other && styles.fillOther,
                            { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                        ]}
                    />
                </View>

                <View style={[styles.shareAnchor, { start: `${percent}%` }]} pointerEvents="none">
                    <Text variant="caption" weight="bold" tone="successText">
                        {`${percent}%`}
                    </Text>
                    <View style={styles.caret} />
                </View>
            </View>

            {/* `MoneyValue` renders a bare Text when the currency is hidden, so
                the column's width belongs to a box around it. */}
            <View style={styles.amount}>
                <MoneyValue
                    amount={row.amount}
                    variant="body"
                    weight="bold"
                    tone="ink2"
                    showCurrency={false}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        alignSelf: 'stretch',
        padding: space[4.5],
        borderRadius: radius.xl3,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    total: {
        alignItems: 'flex-start',
        gap: space[1],
        paddingBottom: space[4.5],
        marginBottom: space[4.5],
        borderBottomWidth: 1,
        borderBottomColor: color.hair,
    },
    totalLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        alignSelf: 'stretch',
    },
    empty: { paddingVertical: space[4], alignItems: 'center' },

    methods: { gap: space[3.5] },
    methodRow: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    tile: {
        width: TILE,
        height: TILE,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: space[2],
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    barCol: { flex: 1, justifyContent: 'flex-end' },
    track: {
        height: BAR_HEIGHT,
        borderRadius: radius.full,
        overflow: 'hidden',
        backgroundColor: color.surface2,
    },
    fill: { height: '100%', borderRadius: radius.full, backgroundColor: color.success },
    fillOther: { backgroundColor: color.muted },

    // `start` puts the box's leading edge on the bar's head; the negative
    // margin pulls it back by half its width so the label centres there. A
    // zero-width box would centre too, but Android clips the overflow and the
    // label disappears.
    shareAnchor: {
        position: 'absolute',
        bottom: BAR_HEIGHT + CARET,
        width: SHARE_LABEL,
        marginStart: -SHARE_LABEL / 2,
        alignItems: 'center',
    },
    caret: {
        width: 0,
        height: 0,
        borderStartWidth: 3,
        borderEndWidth: 3,
        borderTopWidth: CARET,
        borderStartColor: color.transparent,
        borderEndColor: color.transparent,
        borderTopColor: color.successText,
    },
    amount: { minWidth: 52, alignItems: 'flex-end' },
});
