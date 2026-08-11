/**
 * Checkout — the last step of the visit flow (§8). `chargedTotal` is what the
 * patient owes and is editable here; `paidTotal` is what they hand over now
 * and may be zero — an unpaid visit is a balance, not a blocked checkout.
 * Overpayment is not allowed (§7.6): the entry clamps to what is due rather
 * than rejecting on submit, because a cash clinic has no refund workflow. The
 * charge cannot go below what is already paid either (that would check the
 * patient out in credit), so the checkout is refused instead. Both amount
 * fields route through the same clamp because the amount due moves with the
 * charge.
 */
import { PAYMENT_METHODS, type PaymentMethod, PIASTRES_PER_POUND } from '@mawid/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Callout, Chip, NumericField, Sheet, TextField } from '../../../components/ui';
import { color, radius, space, Text } from '../../../theme';
import { type Appointment, api, useLocalMutation, type Visit } from '../data';
import { describeError } from '../errors';
import { amountDue, formatMoney, poundsEntry } from '../money';
import { _LocalMoneyValue } from './_LocalMoneyValue';

export type CheckoutSheetProps = {
    visible: boolean;
    appointment: Appointment | null;
    visit: Visit | null;
    onClose: () => void;
    onDone: (message: string) => void;
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
    cash: 'Cash',
    visa: 'Card',
    instapay: 'Instapay',
    other: 'Other',
};

function toPiastres(pounds: string): number {
    const digits = poundsEntry(pounds);
    return digits ? Number(digits) * PIASTRES_PER_POUND : 0;
}

function toPounds(piastres: number): string {
    return String(Math.round(piastres / PIASTRES_PER_POUND));
}

export function CheckoutSheet({ visible, appointment, visit, onClose, onDone }: CheckoutSheetProps) {
    const [charged, setCharged] = useState(() => toPounds(visit?.chargedTotal ?? 0));
    const [paid, setPaid] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [methodNote, setMethodNote] = useState('');
    const [clamped, setClamped] = useState(false);

    const checkOut = useLocalMutation(api.checkOut);

    const chargedPiastres = toPiastres(charged);

    const alreadyPaid = visit?.paidTotal ?? 0;
    const due = amountDue(chargedPiastres, alreadyPaid);

    const paidPiastres = toPiastres(paid);
    const remaining = due - paidPiastres;
    const noteMissing = paidPiastres > 0 && method === 'other' && methodNote.trim() === '';

    const chargedTooLow = chargedPiastres < alreadyPaid;

    function clampPaidTo(nextDue: number, entry: string): void {
        const digits = poundsEntry(entry);
        if (toPiastres(digits) > nextDue) {
            setPaid(toPounds(nextDue));
            setClamped(true);
            return;
        }
        setClamped(false);
        setPaid(digits);
    }

    function setChargedEntry(next: string) {
        const digits = poundsEntry(next);
        setCharged(digits);
        clampPaidTo(amountDue(toPiastres(digits), alreadyPaid), paid);
    }

    function setPaidClamped(next: string) {
        clampPaidTo(due, next);
    }

    function submit() {
        if (!visit || chargedTooLow) return;
        checkOut.mutate(
            {
                visitId: visit.id,
                chargedTotal: chargedPiastres,
                paidTotal: paidPiastres,
                method,
                methodNote: method === 'other' ? methodNote.trim() : null,
            },
            {
                onSuccess: (settled) => {
                    onDone(
                        settled.balance > 0
                            ? `Checked out · ${formatMoney(settled.balance)} outstanding`
                            : 'Checked out · settled in full',
                    );
                    onClose();
                },
            },
        );
    }

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            dismissable={!checkOut.pending}
            title="Check out"
            subtitle={appointment?.patient.name}
            testID="checkout-sheet"
            footer={
                <Button
                    label={remaining > 0 ? `Check out · ${formatMoney(remaining)} left` : 'Check out'}
                    block
                    loading={checkOut.pending}
                    disabled={!visit || noteMissing || chargedTooLow}
                    onPress={submit}
                />
            }
        >
            <View style={styles.due}>
                <Text variant="eyebrow" tone="muted">
                    AMOUNT DUE
                </Text>
                <_LocalMoneyValue piastres={due} variant="figure" />
                {alreadyPaid > 0 ? (
                    <Text variant="caption" tone="muted">
                        {formatMoney(alreadyPaid)} already paid on this visit
                    </Text>
                ) : null}
            </View>

            <NumericField
                label="Charged"
                variant="end"
                prefix="EGP"
                value={charged}
                onChangeText={setChargedEntry}
                hint="The total for the visit. Lower it to give a discount."
                error={
                    chargedTooLow
                        ? `They have already paid ${formatMoney(alreadyPaid)} on this visit. The total cannot be less than that.`
                        : undefined
                }
            />

            <View style={styles.section}>
                <NumericField
                    label="Paying now"
                    variant="display"
                    prefix="EGP"
                    value={paid}
                    onChangeText={setPaidClamped}
                    placeholder="0"
                />

                <View style={styles.quick}>
                    <Chip
                        label="Full"
                        grow
                        selected={paidPiastres === due && paidPiastres > 0}
                        onPress={() => setPaidClamped(toPounds(due))}
                    />
                    <Chip label="Half" grow onPress={() => setPaidClamped(toPounds(Math.round(due / 2)))} />
                    <Chip
                        label="Nothing"
                        grow
                        selected={paidPiastres === 0 && paid !== ''}
                        onPress={() => setPaidClamped('0')}
                    />
                </View>

                {clamped ? (
                    <Text variant="caption" tone="due">
                        They cannot pay more than the amount due.
                    </Text>
                ) : null}
            </View>

            {paidPiastres > 0 ? (
                <View style={styles.section}>
                    <Text variant="eyebrow" tone="muted">
                        HOW THEY PAID
                    </Text>
                    <View style={styles.methods}>
                        {PAYMENT_METHODS.map((option) => (
                            <Chip
                                key={option}
                                label={METHOD_LABEL[option]}
                                grow
                                selected={method === option}
                                onPress={() => setMethod(option)}
                            />
                        ))}
                    </View>

                    {method === 'other' ? (
                        <TextField
                            label="What was it"
                            required
                            value={methodNote}
                            onChangeText={setMethodNote}
                            placeholder="Instapay to the clinic account"
                            error={noteMissing ? 'Say how they paid.' : undefined}
                        />
                    ) : null}
                </View>
            ) : (
                <View style={styles.section}>
                    <Callout tone="info">
                        Nothing paid now. The visit closes with {formatMoney(remaining)} outstanding, which
                        shows on the patient’s balance.
                    </Callout>
                </View>
            )}

            {checkOut.error ? (
                <View style={styles.section}>
                    <Callout tone="warning" title={describeError(checkOut.error, 'check-out').title}>
                        {describeError(checkOut.error, 'check-out').body ?? ''}
                    </Callout>
                </View>
            ) : null}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    due: {
        alignItems: 'center',
        gap: space[1],
        paddingVertical: space[4],
        marginBottom: space[4],
        backgroundColor: color.canvas,
        borderRadius: radius.xl2,
    },
    section: { marginTop: space[4], gap: space[3] },
    quick: { flexDirection: 'row', gap: space[2] },
    methods: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
