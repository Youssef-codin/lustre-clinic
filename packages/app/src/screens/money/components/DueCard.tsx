// The canvas panel for a visit's balance. Overpayment does not exist (§7.6): a
// payment is clamped to the amount due when it is taken, so there is no
// negative balance — nothing here handles `balance < 0` because nothing can
// produce one.
import { StyleSheet, View } from 'react-native';
import { Card, CardDivider, Dot } from '../../../components/ui';
import { color, space, Text } from '../../../theme';
import { MoneyValue } from '../MoneyValue';

export type DueCardProps = {
    balance: number;
    chargedTotal: number;
    paidTotal: number;
};

export function DueCard({ balance, chargedTotal, paidTotal }: DueCardProps) {
    const settled = balance <= 0;

    return (
        <Card testID="money-due-card">
            <View style={styles.head}>
                <View style={styles.status}>
                    <Dot tone={settled ? 'success' : 'due'} size={7} />
                    <Text variant="eyebrow" tone="muted">
                        {settled ? 'Settled' : 'Outstanding'}
                    </Text>
                </View>

                <MoneyValue
                    amount={settled ? 0 : balance}
                    variant="figure"
                    currencyVariant="headline"
                    tone={settled ? 'success' : 'due'}
                />
            </View>

            <CardDivider />

            <View style={styles.breakdown}>
                <BreakdownRow label="Charged" amount={chargedTotal} />
                <BreakdownRow label="Paid" amount={paidTotal} />
            </View>
        </Card>
    );
}

function BreakdownRow({ label, amount }: { label: string; amount: number }) {
    return (
        <View style={styles.row}>
            <Text variant="body" tone="ink2">
                {label}
            </Text>
            <MoneyValue amount={amount} variant="callout" currencyVariant="caption" tone="ink2" />
        </View>
    );
}

const styles = StyleSheet.create({
    head: {
        alignItems: 'flex-start',
        gap: space[2],
        padding: space[5],
        backgroundColor: color.canvas,
    },
    status: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    breakdown: { paddingHorizontal: space[4], paddingVertical: space[2] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        paddingVertical: space[2],
    },
});
