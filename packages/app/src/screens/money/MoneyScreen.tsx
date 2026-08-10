import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, EmptyState, ScreenHeader, SearchField, SectionLabel } from '../../components/ui';
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

// The money dashboard — `money-dashboard-v2.html`, the largest design in the
// export. Hero, stat cards, takings, debtors, search.
//
// Every figure on this screen was computed by the server. The screen holds three
// independent queries and each renders its own loading and error state, so a
// takings card that failed never takes the hero down with it, and a figure is
// never drawn from a query that did not answer.
//
// The four things this screen deliberately does NOT do:
//   - add, subtract or round any amount (§10, §7.12)
//   - format money (that is `MoneyValue`, and only `MoneyValue`)
//   - cache a balance across a period change
//   - filter the debtor list by period — see `PeriodTabs` for why

export type MoneyScreenProps = {
    /** Bumped when a payment lands anywhere in the cluster; every figure re-reads. */
    version: number;
    onOpenPatient: (patientId: string, name: string) => void;
};

export function MoneyScreen({ version, onOpenPatient }: MoneyScreenProps) {
    const [period, setPeriod] = useState<Period>('month');
    const [search, setSearch] = useState('');

    // All three are period- and version-keyed: a payment changes what was
    // collected, which changes the rate, the takings and the amount owed.
    const summary = useBalanceSummary(period, version);
    const takings = useTakings(period, version);
    const outstanding = useOutstanding(version);

    const periodLabel = PERIOD_LABEL[period];

    // Client-side, over the array `balance.outstanding` returned — the procedure
    // takes no search argument (BLOCKED.md #6). Name and phone, because the desk
    // knows a patient by either.
    const debtors = useMemo(() => {
        const rows = outstanding.data?.patients ?? [];
        const needle = search.trim().toLowerCase();
        if (!needle) return rows;

        return rows.filter(
            (row) => row.name.toLowerCase().includes(needle) || row.phone.replace(/\s/g, '').includes(needle),
        );
    }, [outstanding.data, search]);

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
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
                                // The one figure on this screen that is not
                                // period-scoped, and it sits beside four that
                                // are — so it says so.
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

            {/* The list total, not the filtered total — which is why it is
                hidden while searching rather than recomputed. A search narrows
                what is shown, and a total that moved with it would read as the
                clinic being owed less than it is. */}
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
    content: { gap: space[4], paddingBottom: size.nav + space[6] },
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
