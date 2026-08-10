import { PAYMENT_METHODS, type PaymentMethod } from '@mawid/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Callout, Chip, NumericField, Sheet, TextField } from '../../../components/ui';
import { space, Text } from '../../../theme';
import type { RecordPaymentInput } from '../_LocalMoneyApi';
import { MoneyValue } from '../_LocalMoneyValue';
import { methodLabel } from '../format';
import { clampToBalance, formatEgp, isWholePounds, toEgp } from '../money';

// `visit.recordPayment` (§13) — a payment made after checkout, against a
// balance. Inventory §5's `domain/MethodTiles` is the 2×2 grid on the checkout
// screen; this is the same choice as a chip row, because here it sits under a
// keyboard rather than filling a screen.
//
// Two rules this screen exists to hold:
//
//   §7.6 — OVERPAYMENT DOES NOT EXIST. The entered amount is clamped to the
//   amount due and the clamp is announced, exactly as `visit-payment.html` does.
//   There is no refund state anywhere in the system to fall into.
//
//   §7.12 — the field takes whole pounds and nothing else. Piastres are never
//   shown and never typed; the multiply happens once, here, on submit.
//
// The clamp is a courtesy, not an invariant: the server takes any positive
// amount, and two phones on one tailnet can both clamp against a figure that has
// already moved. See BLOCKED.md #7.

export type RecordPaymentSheetProps = {
    visible: boolean;
    onClose: () => void;
    /** The balance to clamp against, in piastres, as the server derived it. */
    balance: number;
    visitId: string;
    isPending: boolean;
    error: string | null;
    onSubmit: (input: RecordPaymentInput) => void;
};

export function RecordPaymentSheet({
    visible,
    onClose,
    balance,
    visitId,
    isPending,
    error,
    onSubmit,
}: RecordPaymentSheetProps) {
    const dueEgp = toEgp(balance);

    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [note, setNote] = useState('');

    // Why the field did not take what was typed. It lives inside the sheet, not
    // on the screen behind it: `ui/Sheet` is a native `Modal`, so a `Toast` in
    // the screen root renders beneath the modal window and its scrim and is
    // excluded from the accessibility tree by `accessibilityViewIsModal`. §7.6
    // requires the clamp to be announced, and an announcement nobody can see
    // does not meet it.
    const [notice, setNotice] = useState<string | null>(null);

    // A fresh sheet each time it opens. A leftover amount from a previous visit
    // is the sort of thing that gets confirmed without being read.
    useEffect(() => {
        if (visible) {
            setAmount('');
            setMethod('cash');
            setNote('');
            setNotice(null);
        }
    }, [visible]);

    function changeAmount(text: string) {
        if (!isWholePounds(text)) {
            setNotice('Whole pounds only — piastres are not recorded.');
            return;
        }

        const entered = text === '' ? 0 : Number(text);

        if (entered > dueEgp) {
            setAmount(String(dueEgp));
            setNotice(`That is more than the amount due. Capped at ${formatEgp(balance)}.`);
            return;
        }

        setNotice(null);
        setAmount(text);
    }

    const enteredEgp = amount === '' ? 0 : Number(amount);
    const noteMissing = method === 'other' && note.trim() === '';
    const canSubmit = enteredEgp > 0 && !noteMissing;

    function submit() {
        if (!canSubmit) return;

        onSubmit({
            visitId,
            // Clamped a second time, and in piastres — the field's own clamp is
            // against a rounded pound figure and can round upward past the
            // balance. `clampToBalance` is the one that decides.
            amount: clampToBalance(enteredEgp, balance),
            method,
            methodNote: method === 'other' ? note.trim() : null,
        });
    }

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title="Record a payment"
            // §14 — the write crosses Tailscale. Closing the sheet mid-write
            // would leave the caller unable to say whether it landed.
            dismissable={!isPending}
            testID="money-record-payment"
            footer={
                <Button
                    label="Record payment"
                    onPress={submit}
                    loading={isPending}
                    disabled={!canSubmit}
                    block
                    testID="money-record-payment-submit"
                />
            }
        >
            <View style={styles.due}>
                <Text variant="subhead" tone="muted">
                    Amount due
                </Text>
                <MoneyValue amount={balance} variant="amount" currencyVariant="caption" tone="due" />
            </View>

            <NumericField
                label="Amount paid"
                variant="display"
                prefix="EGP"
                placeholder="0"
                value={amount}
                onChangeText={changeAmount}
                hint="Whole pounds. More than the amount due is not accepted."
                editable={!isPending}
            />

            {notice ? (
                <View accessibilityLiveRegion="assertive" style={styles.notice}>
                    <Callout tone="warning">
                        <Text variant="subhead" tone="due">
                            {notice}
                        </Text>
                    </Callout>
                </View>
            ) : null}

            <View style={styles.quick}>
                <Chip
                    label="Full"
                    selected={enteredEgp === dueEgp && dueEgp > 0}
                    onPress={() => setAmount(String(dueEgp))}
                    disabled={isPending}
                    grow
                />
                <Chip
                    label="Half"
                    selected={enteredEgp > 0 && enteredEgp === Math.floor(dueEgp / 2)}
                    onPress={() => setAmount(String(Math.floor(dueEgp / 2)))}
                    disabled={isPending}
                    grow
                />
            </View>

            <View style={styles.methods}>
                {PAYMENT_METHODS.map((option) => (
                    <Chip
                        key={option}
                        label={methodLabel(option)}
                        selected={option === method}
                        onPress={() => setMethod(option)}
                        disabled={isPending}
                        testID={`money-method-${option}`}
                    />
                ))}
            </View>

            {method === 'other' ? (
                <TextField
                    label="What was it?"
                    required
                    placeholder="Bank transfer"
                    value={note}
                    onChangeText={setNote}
                    editable={!isPending}
                />
            ) : null}

            {error ? (
                <Callout tone="warning" title="The payment was not recorded">
                    <Text variant="subhead" tone="due">
                        {error}
                    </Text>
                </Callout>
            ) : null}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    due: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3] },
    notice: { alignSelf: 'stretch' },
    quick: { flexDirection: 'row', gap: space[2] },
    methods: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
