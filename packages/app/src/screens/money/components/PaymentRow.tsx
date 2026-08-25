// A read-only row of a visit's payment history. The editable `PaymentRow` on
// the visit-edit screen is a different component — history is never rewritten
// here; a wrong payment is corrected where the visit is edited.
import { StyleSheet, View } from 'react-native';
import { size, space, Text } from '../../../theme';
import type { VisitPayment } from '../data';
import { longDateTime, methodLabel } from '../format';
import { MoneyValue } from '../MoneyValue';

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
