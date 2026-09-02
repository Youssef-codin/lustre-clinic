// The app's only payment entry point. Two questions — how much, and how — and
// the server allocates the money across the patient's unsettled visits
// oldest-first (`balance.settle`). Nothing here names a visit, and nothing here
// does arithmetic on a balance beyond turning typed pounds into piastres: §10's
// rule is that balances are derived, and the split this sheet reads back is the
// server's, not a local guess at what it will be.
//
// It was `visitId`-shaped until the allocation landed, which is why the desk had
// to pick a visit off a list before it could take money. That list is gone.
//
// Overpayment is refused rather than parked, because a credit balance is not a
// concept the model has. The entry caps at the amount due and names the real
// total when it does — "They owe 9,550" is the sentence the desk needs, not
// "invalid amount". The cap is against piastres, never the rounded pound figure:
// a 120.50 balance displays as a due of 121, and 121 pounds is more than is owed.
//
// The notice lives inside the sheet because `ui/Sheet` is a native Modal and a
// screen-level toast renders beneath it. The sheet refuses to dismiss mid-write:
// the write crosses Tailscale, and a sheet closed while it is in flight leaves
// the outcome unknowable to the person who took the money.
import { PAYMENT_METHODS, type PaymentMethod } from '@lustre/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MoneyValue } from '../../../components/domain';
import { Button, Callout, Chip, NumericField, Sheet, TextField } from '../../../components/ui';
import { space, Text } from '../../../theme';
import type { SettleInput } from '../data/types';
import { clampToOutstanding, formatMoney, isWholePounds, methodLabel, toPounds } from './money';

export type RecordPaymentSheetProps = {
    visible: boolean;
    onClose: () => void;
    patientId: string;
    /** What the patient owes across every unsettled visit, in piastres. */
    outstanding: number;
    isPending: boolean;
    /** Localized from `ERROR_CODE`, never parsed from the server's message (§4). */
    error: string | null;
    onSubmit: (input: SettleInput) => void;
};

export function RecordPaymentSheet({
    visible,
    onClose,
    patientId,
    outstanding,
    isPending,
    error,
    onSubmit,
}: RecordPaymentSheetProps) {
    const duePounds = toPounds(outstanding);

    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [note, setNote] = useState('');
    const [notice, setNotice] = useState<string | null>(null);

    // Opening is what resets it, not closing: a sheet that failed keeps what was
    // typed on screen while the failure is being read.
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

        if (entered > duePounds) {
            setAmount(String(duePounds));
            setNotice(`That is more than they owe. They owe ${formatMoney(outstanding)}.`);
            return;
        }

        setNotice(null);
        setAmount(text);
    }

    const enteredPounds = amount === '' ? 0 : Number(amount);
    const noteMissing = method === 'other' && note.trim() === '';
    const canSubmit = enteredPounds > 0 && !noteMissing;

    function submit() {
        if (!canSubmit) return;

        onSubmit({
            patientId,
            amount: clampToOutstanding(enteredPounds, outstanding),
            method,
            methodNote: method === 'other' ? note.trim() : null,
        });
    }

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title="Record a payment"
            dismissable={!isPending}
            testID="record-payment-sheet"
            footer={
                // `ui/Button` swallows a repeat press for 500ms, which on this
                // screen is the difference between one payment and two.
                <Button
                    label="Record payment"
                    onPress={submit}
                    loading={isPending}
                    disabled={!canSubmit}
                    block
                    testID="record-payment-submit"
                />
            }
        >
            <View style={styles.due}>
                <Text variant="subhead" tone="muted">
                    Outstanding
                </Text>
                <MoneyValue piastres={outstanding} variant="amount" tone="due" weight="bold" />
            </View>

            <NumericField
                label="Amount paid"
                variant="display"
                prefix="EGP"
                placeholder="0"
                // No decimal key: the column is integer piastres and piastres
                // are never entered.
                keyboardType="number-pad"
                value={amount}
                onChangeText={changeAmount}
                hint="Whole pounds. More than they owe is not accepted."
                editable={!isPending}
                testID="record-payment-amount"
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
                {/* Full is "settle everything", which is now the common case —
                    it clears the whole balance rather than one visit's share. */}
                <Chip
                    label="Full"
                    selected={enteredPounds === duePounds && duePounds > 0}
                    onPress={() => changeAmount(String(duePounds))}
                    disabled={isPending}
                    grow
                />
                <Chip
                    label="Half"
                    selected={enteredPounds > 0 && enteredPounds === Math.floor(duePounds / 2)}
                    onPress={() => changeAmount(String(Math.floor(duePounds / 2)))}
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
                        testID={`record-payment-method-${option}`}
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
