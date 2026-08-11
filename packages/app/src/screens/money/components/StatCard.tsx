// A label / value / sub stat card beneath the hero. Compact figures are allowed
// here and in the hero only (§7.12); the `older` and `discount` variants are
// not built (BLOCKED.md #9). `due` colours the figure orange — money owed, not
// money in.
import { StyleSheet } from 'react-native';
import { Card } from '../../../components/ui';
import { space, Text } from '../../../theme';
import { MoneyValue } from '../_LocalMoneyValue';

export type StatCardProps = {
    label: string;
    amount: number;
    sub?: string;
    tone?: 'ink' | 'due' | 'success';
    testID?: string;
};

export function StatCard({ label, amount, sub, tone = 'ink', testID }: StatCardProps) {
    return (
        <Card padded style={styles.card} testID={testID}>
            <Text variant="eyebrow" tone="muted">
                {label}
            </Text>

            <MoneyValue amount={amount} variant="title3" currencyVariant="caption" tone={tone} compact />

            {sub ? (
                <Text variant="caption" tone="muted">
                    {sub}
                </Text>
            ) : null}
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { flex: 1, gap: space[1.5] },
});
