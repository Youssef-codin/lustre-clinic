import { StyleSheet, View } from 'react-native';
import { size, space, Text } from '../../../theme';
import type { VisitPayment } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { longDateTime, methodLabel } from '../format';

// One row of `payments` for a visit, read-only. Inventory §5's
// `domain/PaymentRow` is the *editable* one on the visit-edit screen — a method
// select, an amount input and a remove ✕. This is not that: §10 says a payment
// is a row and never a state, and history is not something the money screens
// rewrite. A wrong payment is corrected where the visit is edited.

export type PaymentRowProps = {
    payment: VisitPayment;
};

export function PaymentRow({ payment }: PaymentRowProps) {
    return (
        <View style={styles.row} testID={`money-payment-${payment.id}`}>
            <View style={styles.text}>
                <Text variant="body" weight="medium">
                    {methodLabel(payment.method, payment.methodNote)}
                </Text>
                <Text variant="subhead" tone="muted">
                    {longDateTime(payment.paidAt)}
                </Text>
            </View>

            <MoneyValue amount={payment.amount} variant="amount" currencyVariant="caption" tone="success" />
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[2],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
    },
    text: { flex: 1, gap: space[0.5] },
});
