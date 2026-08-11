// The money dashboard. Every figure was computed by the server: this screen
// does not add, subtract, round, format or cache money, and the debtor list is
// deliberately not period-filtered (an outstanding balance is standing, not
// period-scoped). Three independent queries each render their own loading and
// error states, so one failure never takes another figure down. Search is
// client-side because `balance.outstanding` takes no argument (BLOCKED.md #6).
// The list total is the outstanding total, not the filtered total, so it is
// hidden while searching rather than recomputed.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
    Card,
    EmptyState,
    ScreenHeader,
    SearchField,
    SectionLabel,
    usePullToRefresh,
} from '../../components/ui';
import { size, space, Text } from '../../theme';
import {
    type PatientBalance,
    PERIOD_LABEL,
    type Period,
    useBalanceSummary,
    useOutstanding,
    useTakings,
} from './_LocalMoneyApi';
import { MoneyValue } from './_LocalMoneyValue';
import { DebtorRow } from './components/DebtorRow';
import { HeroCollectionCard } from './components/HeroCollectionCard';
import { LoadState, SkeletonCard, SkeletonRows } from './components/LoadState';
import { PeriodTabs } from './components/PeriodTabs';
import { StatCard } from './components/StatCard';
import { TakingsCard } from './components/TakingsCard';

export type MoneyScreenProps = {
    version: number;
    onOpenPatient: (patientId: string, name: string) => void;
};

export function MoneyScreen({ version, onOpenPatient }: MoneyScreenProps) {
    const [period, setPeriod] = useState<Period>('month');
    const [search, setSearch] = useState('');

    const summary = useBalanceSummary(period, version);
    const takings = useTakings(period, version);
    const outstanding = useOutstanding(version);

    const periodLabel = PERIOD_LABEL[period];

    const debtors = useMemo(() => {
        const rows = outstanding.data?.patients ?? [];
        const needle = search.trim().toLowerCase();
        if (!needle) return rows;

        return rows.filter(
            (row) => row.name.toLowerCase().includes(needle) || row.phone.replace(/\s/g, '').includes(needle),
        );
    }, [outstanding.data, search]);

    // The dashboard's three figures, for the period on screen — a pull does not
    // touch the other periods or the panes pushed over this one, which read
    // themselves when they open. The debtor search is client-side, so a refresh
    // while searching re-reads the same list and re-filters it.
    const refreshControl = usePullToRefresh(
        () => {
            summary.refetch();
            takings.refetch();
            outstanding.refetch();
        },
        summary.isLoading || takings.isLoading || outstanding.isLoading,
    );

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            testID="money-screen"
        >
            <ScreenHeader title="Money" />

            <PeriodTabs value={period} onChange={setPeriod} />

            <View style={styles.gutter}>
                <LoadState
                    isLoading={summary.isLoading}
                    error={summary.error}
                    onRetry={summary.refetch}
                    skeleton={<SkeletonCard height={196} />}
                >
                    {summary.data ? (
                        <HeroCollectionCard summary={summary.data} periodLabel={periodLabel} />
                    ) : null}
                </LoadState>
            </View>

            <View style={styles.gutter}>
                <LoadState
                    isLoading={summary.isLoading || outstanding.isLoading}
                    error={summary.error ?? outstanding.error}
                    onRetry={() => {
                        summary.refetch();
                        outstanding.refetch();
                    }}
                    skeleton={
                        <View style={styles.stats}>
                            <SkeletonCard height={92} />
                            <SkeletonCard height={92} />
                        </View>
                    }
                >
                    {summary.data && outstanding.data ? (
                        <View style={styles.stats}>
                            <StatCard
                                label="Charged"
                                amount={summary.data.charged}
                                sub={periodLabel}
                                testID="money-stat-charged"
                            />
                            <StatCard
                                label="Outstanding"
                                amount={outstanding.data.total}
                                sub="All unpaid visits"
                                tone="due"
                                testID="money-stat-outstanding"
                            />
                        </View>
                    ) : null}
                </LoadState>
            </View>

            <View style={styles.section}>
                <SectionLabel>Takings</SectionLabel>
                <View style={styles.gutter}>
                    <LoadState
                        isLoading={takings.isLoading}
                        error={takings.error}
                        onRetry={takings.refetch}
                        skeleton={<SkeletonRows rows={4} />}
                    >
                        {takings.data ? <TakingsCard takings={takings.data} /> : null}
                    </LoadState>
                </View>
            </View>

            <View style={styles.section}>
                <SectionLabel count={outstanding.data?.patients.length}>Owed by patient</SectionLabel>

                <View style={styles.gutter}>
                    <SearchField
                        value={search}
                        onChangeText={setSearch}
                        onClear={() => setSearch('')}
                        placeholder="Search by name or phone"
                        testID="money-debtor-search"
                    />
                </View>

                <View style={styles.gutter}>
                    <LoadState
                        isLoading={outstanding.isLoading}
                        error={outstanding.error}
                        onRetry={outstanding.refetch}
                        skeleton={<SkeletonRows rows={4} />}
                    >
                        {outstanding.data ? (
                            <DebtorList
                                total={outstanding.data.total}
                                debtors={debtors}
                                searching={search.trim() !== ''}
                                onOpenPatient={onOpenPatient}
                            />
                        ) : null}
                    </LoadState>
                </View>
            </View>
        </ScrollView>
    );
}

function DebtorList({
    total,
    debtors,
    searching,
    onOpenPatient,
}: {
    total: number;
    debtors: PatientBalance[];
    searching: boolean;
    onOpenPatient: (patientId: string, name: string) => void;
}) {
    if (debtors.length === 0) {
        return searching ? (
            <EmptyState title="No patient matches that." weight="line" />
        ) : (
            <EmptyState title="Nothing is outstanding." weight="line" />
        );
    }

    return (
        <View style={styles.debtors}>
            <Card>
                {debtors.map((patient, index) => (
                    <DebtorRow
                        key={patient.patientId}
                        patient={patient}
                        index={index}
                        onPress={() => onOpenPatient(patient.patientId, patient.name)}
                    />
                ))}
            </Card>

            {searching ? null : (
                <View style={styles.totalRow}>
                    <Text variant="subhead" tone="muted">
                        Total outstanding
                    </Text>
                    <MoneyValue
                        amount={total}
                        variant="amount"
                        currencyVariant="caption"
                        tone="due"
                        testID="money-outstanding-total"
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    content: { gap: space[4], paddingBottom: space[12] },
    gutter: { paddingHorizontal: size.gutter },
    section: { gap: space[2] },
    stats: { flexDirection: 'row', gap: space[3] },
    debtors: { gap: space[3] },
    totalRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: space[3],
        paddingHorizontal: space[1],
    },
});
