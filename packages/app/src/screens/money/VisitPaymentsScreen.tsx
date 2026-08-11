// Payment history for one visit, and the one write the money cluster makes.
// §10: a payment is a row, not a state transition — this screen appends and
// re-reads, and never patches a balance locally; the figure after a payment is
// the one the server derived from the rows. `ref`/`startsAt`/name are passed in
// because `visit.byId` joins neither the appointment nor the patient
// (BLOCKED.md #14). The toast is a child of the screen root, not the scroll
// content, and is only raised after the sheet closes: `ui/Sheet` is a native
// Modal, so a toast raised while it is open would render behind it.
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

export type VisitPaymentsScreenProps = {
    visitId: string;
    visitRef: string;
    startsAt: string;
    patientName: string;
    version: number;
    onBack: () => void;
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
        if (!updated) return;

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
