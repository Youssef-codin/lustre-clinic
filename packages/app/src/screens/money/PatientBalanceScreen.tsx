// Spec §10 — a patient's unpaid visits. The total is NOT summed from the rows:
// it is the figure `balance.outstanding` derived, read back from that query, so
// it can never drift from the dashboard's number. A patient absent from the
// report owes nothing — a real state here, reached by paying the last balance
// off. `onOpenVisit` passes the whole row because `visit.byId` does not join
// the appointment, so `ref`/`startsAt` come from here.
//
// The patient's record is reached from here rather than from the debtor row on
// the dashboard. The row has to keep opening this screen — it is the only way
// into `VisitPaymentsScreen` → `RecordPaymentSheet`, which is how a payment
// gets recorded against an old visit. So the two destinations sit one level
// apart instead of one list meaning two things depending on whether a search
// happens to be running.
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, SectionLabel, TopBar, usePullToRefresh } from '../../components/ui';
import { size, space, Text } from '../../theme';
import { LoadState, SkeletonCard, SkeletonRows } from './components/LoadState';
import { VisitBalanceRow } from './components/VisitBalanceRow';
import { useOutstanding, useVisitsByPatient, type VisitBalance } from './data';
import { MoneyValue } from './MoneyValue';

export type PatientBalanceScreenProps = {
    patientId: string;
    patientName: string;
    onBack: () => void;
    onOpenVisit: (visit: VisitBalance) => void;
    /** Absent when nothing above the cluster owns the cross-tab record route. */
    onOpenRecord?: () => void;
};

export function PatientBalanceScreen({
    patientId,
    patientName,
    onBack,
    onOpenVisit,
    onOpenRecord,
}: PatientBalanceScreenProps) {
    const visits = useVisitsByPatient(patientId);
    const outstanding = useOutstanding();

    const patient = outstanding.data?.patients.find((row) => row.patientId === patientId);

    // The total comes from `outstanding`, the rows from `byPatient`; refreshing
    // one without the other is how the header and the list start disagreeing.
    const refreshControl = usePullToRefresh(() => {
        visits.refetch();
        outstanding.refetch();
    }, visits.isLoading || outstanding.isLoading);

    return (
        <View style={styles.screen} testID="money-patient-screen">
            <TopBar title={patientName} onBack={onBack} divider />

            <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
                <View style={styles.gutter}>
                    <LoadState
                        isLoading={outstanding.isLoading}
                        error={outstanding.error}
                        onRetry={outstanding.refetch}
                        skeleton={<SkeletonCard height={96} />}
                    >
                        {outstanding.data ? (
                            <Card padded style={styles.total}>
                                <Text variant="eyebrow" tone="muted">
                                    Outstanding
                                </Text>
                                <MoneyValue
                                    amount={patient?.balance ?? 0}
                                    variant="figure"
                                    currencyVariant="headline"
                                    tone={patient ? 'due' : 'success'}
                                    testID="money-patient-total"
                                />
                                <Text variant="subhead" tone="muted">
                                    {patient ? 'Across every unpaid visit' : 'This patient owes nothing.'}
                                </Text>
                            </Card>
                        ) : null}
                    </LoadState>
                </View>

                {/* Outside `LoadState`: the record does not depend on the
                    balance query, and a failed refresh must not take away the
                    way to the patient. */}
                {onOpenRecord ? (
                    <View style={styles.gutter}>
                        <Button
                            label="Open patient record"
                            onPress={onOpenRecord}
                            variant="secondary"
                            block
                            testID="money-open-record"
                        />
                    </View>
                ) : null}

                <View style={styles.section}>
                    <SectionLabel count={visits.data?.length}>Unpaid visits</SectionLabel>

                    <View style={styles.gutter}>
                        <LoadState
                            isLoading={visits.isLoading}
                            error={visits.error}
                            onRetry={visits.refetch}
                            skeleton={<SkeletonRows rows={3} />}
                        >
                            {visits.data && visits.data.length > 0 ? (
                                <Card>
                                    {visits.data.map((visit) => (
                                        <VisitBalanceRow
                                            key={visit.visitId}
                                            visit={visit}
                                            onPress={() => onOpenVisit(visit)}
                                        />
                                    ))}
                                </Card>
                            ) : (
                                <EmptyState title="Every visit is settled." weight="line" />
                            )}
                        </LoadState>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    content: { gap: space[4], paddingTop: space[4], paddingBottom: space[12] },
    gutter: { paddingHorizontal: size.gutter },
    section: { gap: space[2] },
    total: { alignItems: 'flex-start', gap: space[2] },
});
