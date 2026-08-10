import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, EmptyState, SectionLabel, TopBar } from '../../components/ui';
import { size, space, Text } from '../../theme';
import { useOutstanding, useVisitsByPatient, type VisitBalance } from './_LocalMoneyApi';
import { MoneyValue } from './_LocalMoneyValue';
import { LoadState, SkeletonCard, SkeletonRows } from './components/LoadState';
import { VisitBalanceRow } from './components/VisitBalanceRow';

// Spec §10 — "tapping through shows that patient's visits with balances".
//
// The patient's total is NOT summed from the rows on this screen. It is the
// figure `balance.outstanding` derived, read back out of that query, so the
// number here and the number on the dashboard are the same number and cannot
// drift apart by a rounding rule or a filtered row. Summing the visible rows
// would be one line shorter and one class of bug worse.

export type PatientBalanceScreenProps = {
    patientId: string;
    patientName: string;
    /** Bumped when a payment lands, so every figure re-reads. */
    version: number;
    onBack: () => void;
    /**
     * The whole row, not just the id: `visit.byId` does not join the
     * appointment, so the reference and the date the next screen shows come
     * from here (BLOCKED.md #14).
     */
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

    // Absent from the report means this patient owes nothing — which is a real
    // and expected state here, reached by paying the last balance off without
    // leaving the screen.
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
    content: { gap: space[4], paddingTop: space[4], paddingBottom: size.nav + space[6] },
    gutter: { paddingHorizontal: size.gutter },
    section: { gap: space[2] },
    total: { alignItems: 'flex-start', gap: space[2] },
});
