import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, SectionLabel, Toast, TopBar } from '../../components/ui';
import { size, space, Text } from '../../theme';
import { type RecordPaymentInput, useRecordPayment, useVisit } from './_LocalMoneyApi';
import { DueCard } from './components/DueCard';
import { LoadState, SkeletonCard, SkeletonRows } from './components/LoadState';
import { PaymentRow } from './components/PaymentRow';
import { RecordPaymentSheet } from './components/RecordPaymentSheet';
import { errorMessage, longDate } from './format';

// Payment history for one visit, and the one write the money cluster makes:
// `visit.recordPayment` (§13) — a payment against a balance, after checkout.
//
// §10: a payment is a row, not a state transition, and it never edits
// `charged_total`. So this screen appends and re-reads; it never patches a
// balance locally. The figure under "Outstanding" after a payment is the one the
// server derived from the rows, not the one this screen could have worked out.

export type VisitPaymentsScreenProps = {
    visitId: string;
    /**
     * The appointment's reference and date, and the patient's name.
     *
     * Passed in rather than read from `visit.byId`, which returns the visits
     * row and joins neither the appointment nor the patient — so `ref`,
     * `startsAt` and the name are not on it (BLOCKED.md #14). They come from the
     * `balance.byPatient` row this screen was opened from, which already carries
     * the first two, and from the route, which already carries the third.
     */
    visitRef: string;
    startsAt: string;
    patientName: string;
    version: number;
    onBack: () => void;
    /** Raised after a payment lands, so every other screen's figures re-read. */
    onPaymentRecorded: () => void;
};

export function VisitPaymentsScreen({
    visitId,
    visitRef,
    startsAt,
    patientName,
    version,
    onBack,
    onPaymentRecorded,
}: VisitPaymentsScreenProps) {
    const visit = useVisit(visitId, version);
    const payment = useRecordPayment();

    const [sheetOpen, setSheetOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    async function submit(input: RecordPaymentInput) {
        const updated = await payment.mutate(input);
        if (!updated) return; // The error is on the sheet; the sheet stays open.

        setSheetOpen(false);
        setToast('Payment recorded');
        onPaymentRecorded();
    }

    const settled = visit.data ? visit.data.balance <= 0 : false;

    return (
        <View style={styles.screen} testID="money-visit-screen">
            <TopBar title={visitRef} subtitle={patientName} onBack={onBack} divider />

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.gutter}>
                    <LoadState
                        isLoading={visit.isLoading}
                        error={visit.error}
                        onRetry={visit.refetch}
                        skeleton={<SkeletonCard height={168} />}
                    >
                        {visit.data ? (
                            <>
                                <DueCard
                                    balance={visit.data.balance}
                                    chargedTotal={visit.data.chargedTotal}
                                    paidTotal={visit.data.paidTotal}
                                />
                                <Text variant="subhead" tone="muted" style={styles.visitDate}>
                                    {longDate(startsAt)}
                                </Text>
                            </>
                        ) : null}
                    </LoadState>
                </View>

                {visit.data && !settled ? (
                    <View style={styles.gutter}>
                        <Button
                            label="Record a payment"
                            onPress={() => {
                                payment.reset();
                                setSheetOpen(true);
                            }}
                            block
                            testID="money-open-record-payment"
                        />
                    </View>
                ) : null}

                <View style={styles.section}>
                    <SectionLabel count={visit.data?.payments.length}>Payment history</SectionLabel>

                    <View style={styles.gutter}>
                        <LoadState
                            isLoading={visit.isLoading}
                            error={visit.error}
                            onRetry={visit.refetch}
                            skeleton={<SkeletonRows rows={2} />}
                        >
                            {visit.data && visit.data.payments.length > 0 ? (
                                <Card>
                                    {visit.data.payments.map((row) => (
                                        <PaymentRow key={row.id} payment={row} />
                                    ))}
                                </Card>
                            ) : (
                                <EmptyState title="Nothing has been paid on this visit yet." weight="line" />
                            )}
                        </LoadState>
                    </View>
                </View>
            </ScrollView>

            {visit.data ? (
                <RecordPaymentSheet
                    visible={sheetOpen}
                    onClose={() => setSheetOpen(false)}
                    balance={visit.data.balance}
                    visitId={visit.data.id}
                    isPending={payment.isPending}
                    error={payment.error ? errorMessage(payment.error) : null}
                    onSubmit={submit}
                />
            ) : null}

            {/* A child of the screen root, never of the scroll content: a toast
                nested in a ScrollView lands wherever that content has scrolled
                to (ui/README.md).

                Only raised once the sheet has closed. `ui/Sheet` is a native
                `Modal`, and a toast raised while it is open would render behind
                it — which is why the sheet says its own piece inline instead of
                calling up here. */}
            <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    content: { gap: space[4], paddingTop: space[4], paddingBottom: space[12] },
    gutter: { paddingHorizontal: size.gutter },
    section: { gap: space[2] },
    visitDate: { paddingTop: space[2] },
});
