// One of a patient's visits that still owes something. `chargedTotal`,
// `paidTotal` and `balance` arrive from `balance.byPatient` already derived;
// the row prints them and never checks they add up — if they did not, the
// server would be wrong and a client that quietly corrected it would hide that.
import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import type { VisitBalance } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { dayStamp, outstandingAge } from '../format';

export type VisitBalanceRowProps = {
    visit: VisitBalance;
    onPress: () => void;
};

export function VisitBalanceRow({ visit, onPress }: VisitBalanceRowProps) {
    const stamp = dayStamp(visit.startsAt);

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={`money-visit-${visit.visitId}`}
        >
            <View style={styles.stamp}>
                <Text variant="headline" script="mono">
                    {stamp.day}
                </Text>
                <Text variant="tag" tone="muted">
                    {stamp.month}
                </Text>
            </View>

            <View style={styles.text}>
                <Text variant="headline" script="mono">
                    {visit.ref}
                </Text>
                <View style={styles.breakdown}>
                    <Text variant="subhead" tone="muted">
                        Charged
                    </Text>
                    <MoneyValue
                        amount={visit.chargedTotal}
                        variant="subhead"
                        tone="muted"
                        showCurrency={false}
                    />
                    <Text variant="subhead" tone="muted">
                        · paid
                    </Text>
                    <MoneyValue
                        amount={visit.paidTotal}
                        variant="subhead"
                        tone="muted"
                        showCurrency={false}
                    />
                </View>
            </View>

            <View style={styles.amount}>
                <MoneyValue amount={visit.balance} variant="amount" currencyVariant="caption" tone="due" />
                <Text variant="caption" tone="muted">
                    {outstandingAge(visit.startsAt)}
                </Text>
            </View>

            <Chevron />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[4],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
    },
    stamp: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        paddingVertical: space[1],
        borderRadius: radius.md,
        backgroundColor: color.canvas,
    },
    text: { flex: 1, gap: space[0.5] },
    breakdown: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space[1] },
    amount: { alignItems: 'flex-end', gap: space[0.5] },
    pressed: { opacity: 0.72 },
});
