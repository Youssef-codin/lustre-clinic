// Spec §10 — a patient's unpaid visits. The total is NOT summed from the rows:
// it is the figure `balance.outstanding` derived, read back from that query, so
// it can never drift from the dashboard's number. A patient absent from the
// report owes nothing — a real state here, reached by paying the last balance
// off. `onOpenVisit` passes the whole row because `visit.byId` does not join
// the appointment, so `ref`/`startsAt` come from here (BLOCKED.md #14).
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, EmptyState, SectionLabel, TopBar } from '../../components/ui';
import { size, space, Text } from '../../theme';
import { useOutstanding, useVisitsByPatient, type VisitBalance } from './_LocalMoneyApi';
import { MoneyValue } from './_LocalMoneyValue';
import { LoadState, SkeletonCard, SkeletonRows } from './components/LoadState';
import { VisitBalanceRow } from './components/VisitBalanceRow';

export type PatientBalanceScreenProps = {
    patientId: string;
    patientName: string;
    version: number;
    onBack: () => void;
    onOpenVisit: (visit: VisitBalance) => void;
};

export function PatientBalanceScreen({
    patientId,
    patientName,
    version,
    onBack,
    onOpenVisit,
}: PatientBalanceScreenProps) {
    const visits = useVisitsByPatient(patientId, version);
    const outstanding = useOutstanding(version);

    const patient = outstanding.data?.patients.find((row) => row.patientId === patientId);

    return (
        <View style={styles.screen} testID="money-patient-screen">
            <TopBar title={patientName} onBack={onBack} divider />

            <ScrollView contentContainerStyle={styles.content}>
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
