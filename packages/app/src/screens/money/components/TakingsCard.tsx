import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Card, CardDivider, duration, easing, useReducedMotion } from '../../../components/ui';
import { color, radius, space, Text } from '../../../theme';
import type { MethodTaking, TakingsReport } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { methodLabel } from '../format';

// Inventory §5 `domain/TakingsCard` — a total, then one row per payment method
// with a bar, a percentage and an amount.
//
// The endpoint behind this does not exist yet (BLOCKED.md #5); the card is real
// and the stub serves the shape it needs. Amounts are full here, never compact:
// §7.12 allows compact in the hero and the stat cards only.
//
// The designs draw an icon per method. There is no icon set (ui/README.md), and
// a made-up glyph per payment method would be worse than none, so the row leads
// with its label and the bar carries the comparison.

const BAR_HEIGHT = 4;

export type TakingsCardProps = {
    takings: TakingsReport;
};

export function TakingsCard({ takings }: TakingsCardProps) {
    const { total, byMethod } = takings;

    return (
        <Card testID="money-takings">
            <View style={styles.totalRow}>
                <Text variant="callout" tone="ink2">
                    Collected
                </Text>
                <MoneyValue amount={total} variant="amount" currencyVariant="footnote" weight="medium" />
            </View>

            {total === 0 ? (
                <View style={styles.empty}>
                    <Text variant="subhead" tone="muted">
                        Nothing was collected in this period.
                    </Text>
                </View>
            ) : (
                byMethod.map((row) => (
                    <View key={row.method}>
                        <CardDivider />
                        <MethodRow row={row} total={total} />
                    </View>
                ))
            )}
        </Card>
    );
}

function MethodRow({ row, total }: { row: MethodTaking; total: number }) {
    // A share of a total, not an amount — no money is computed here.
    const share = total > 0 ? row.amount / total : 0;
    const percent = Math.round(share * 100);

    const width = useRef(new Animated.Value(0)).current;
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const animation = Animated.timing(width, {
            toValue: share,
            duration: reducedMotion ? 0 : duration.fadeup,
            easing: easing.standard,
            // Width is a layout property, so this cannot run on the native
            // thread. Four rows, once per period change.
            useNativeDriver: false,
        });

        animation.start();
        return () => animation.stop();
    }, [share, width, reducedMotion]);

    return (
        <View style={styles.methodRow}>
            <View style={styles.methodTop}>
                <Text variant="callout">{methodLabel(row.method)}</Text>
                <View style={styles.spacer} />
                <MoneyValue amount={row.amount} variant="callout" currencyVariant="caption" tone="ink2" />
            </View>

            <View style={styles.methodBottom}>
                <View
                    style={styles.track}
                    accessibilityRole="progressbar"
                    accessibilityLabel={`${methodLabel(row.method)} share of takings`}
                    accessibilityValue={{ min: 0, max: 100, now: percent }}
                >
                    <Animated.View
                        style={[
                            styles.fill,
                            {
                                width: width.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                }),
                            },
                        ]}
                    />
                </View>

                <Text variant="tag" tone="muted" style={styles.percent}>
                    {`${percent}%`}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    totalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        backgroundColor: color.canvas,
    },
    empty: { paddingHorizontal: space[4], paddingVertical: space[5], alignItems: 'center' },
    methodRow: { gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] },
    methodTop: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
    spacer: { flex: 1 },
    methodBottom: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    track: {
        flex: 1,
        height: BAR_HEIGHT,
        borderRadius: radius.full,
        overflow: 'hidden',
        backgroundColor: color.surface2,
    },
    fill: { height: '100%', borderRadius: radius.full, backgroundColor: color.ink },
    // Fixed, so the bars all end at the same x and the percentages form a column.
    percent: { minWidth: 30, textAlign: 'center' },
});
