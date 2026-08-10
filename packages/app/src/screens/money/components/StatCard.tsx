import { StyleSheet } from 'react-native';
import { Card } from '../../../components/ui';
import { space, Text } from '../../../theme';
import { MoneyValue } from '../_LocalMoneyValue';

// Inventory §5 `domain/StatCard` — label / value / sub, sat in a row beneath the
// hero. Compact figures are allowed here and in the hero, nowhere else (§7.12).
//
// The `older` and `discount` variants are not built — BLOCKED.md #9.

export type StatCardProps = {
    label: string;
    /** Integer piastres. */
    amount: number;
    sub?: string;
    /** `due` colours the figure orange: this is money owed, not money in. */
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
