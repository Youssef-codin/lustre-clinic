// Every patient, and the search over them. Arabic and Latin names are one list
// — rows set no face and `<Text>` picks the script per string (§6). Order is
// the server's (newest first); the A–Z grouping the design describes is not
// drawn in it and is not invented here. Capped at the query limit (25), so a
// plain ScrollView beats a FlatList. Balances are a separate query so a money
// failure costs only the row's amount. A refresh that failed over an existing
// list leaves it up — stale, not gone (§7.14). The search is debounced because
// it runs over Tailscale; stale answers are dropped by `useQuery`.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
    Banner,
    Card,
    CardDivider,
    EmptyState,
    ScreenHeader,
    SearchField,
    SectionLabel,
    usePullToRefresh,
} from '../../components/ui';
import { color, size, space } from '../../theme';
import { _LocalPatientRow } from './components/_LocalPatientRow';
import { SkeletonRows } from './components/_LocalSkeleton';
import { _LocalPatientsApi } from './data/_LocalPatientsApi';
import { useQuery } from './data/_LocalQuery';
import { errorText } from './data/errors';

export type PatientListScreenProps = {
    onOpen: (patientId: string) => void;
};

const DEBOUNCE_MS = 250;

export function PatientListScreen({ onOpen }: PatientListScreenProps) {
    const [term, setTerm] = useState('');
    const query = useDebounced(term, DEBOUNCE_MS);

    const patients = useQuery(() => _LocalPatientsApi.search(query), [query]);

    const balances = useQuery(() => _LocalPatientsApi.outstanding(), []);
    const dueByPatient = new Map((balances.data ?? []).map((row) => [row.patientId, row.balance]));

    const searching = query.trim().length > 0;
    const rows = patients.data ?? [];

    // Both queries, and no further than that: the record behind a row is read
    // when it is opened, and the other tabs are refreshed by their own pull. A
    // refresh while searching re-runs the search, not the whole list — the term
    // is the query key, so this is the list on screen.
    const refreshControl = usePullToRefresh(() => {
        patients.refetch();
        balances.refetch();
    }, patients.loading || balances.loading);

    return (
        <View style={styles.screen}>
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                refreshControl={refreshControl}
            >
                <ScreenHeader title="Patients" />

                <View style={styles.search}>
                    <SearchField
                        value={term}
                        onChangeText={setTerm}
                        onClear={() => setTerm('')}
                        placeholder="Search by name or phone"
                        autoCorrect={false}
                        returnKeyType="search"
                        testID="patient-search"
                    />
                </View>

                {patients.error && patients.data && (
                    <View style={styles.inset}>
                        <Banner tone="warning" message="Could not refresh. Showing the last results." />
                    </View>
                )}

                {patients.loading && !patients.data ? (
                    <SkeletonRows count={7} />
                ) : patients.error && !patients.data ? (
                    <EmptyState
                        title="Could not reach the clinic"
                        body={errorText(patients.error)}
                        actionLabel="Try again"
                        onAction={patients.refetch}
                        weight="panel"
                    />
                ) : rows.length === 0 ? (
                    <EmptyState
                        title={searching ? 'No patients found' : 'No patients yet'}
                        body={
                            searching
                                ? 'Nothing matches that name or number.'
                                : 'Patients appear here as they are registered.'
                        }
                        weight="panel"
                    />
                ) : (
                    <View style={styles.list}>
                        <SectionLabel count={rows.length}>{searching ? 'Results' : 'Recent'}</SectionLabel>
                        <Card style={styles.card}>
                            {rows.map((patient, index) => (
                                <View key={patient.id}>
                                    {index > 0 && <CardDivider />}
                                    <_LocalPatientRow
                                        patient={patient}
                                        due={dueByPatient.get(patient.id) ?? 0}
                                        onPress={() => onOpen(patient.id)}
                                    />
                                </View>
                            ))}
                        </Card>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

function useDebounced(value: string, ms: number): string {
    const [settled, setSettled] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), ms);
        return () => clearTimeout(timer);
    }, [value, ms]);

    return settled;
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    content: { paddingBottom: space[12], gap: space[3] },
    search: { paddingHorizontal: size.gutter },
    inset: { paddingHorizontal: size.gutter },
    list: { gap: space[1] },
    card: { marginHorizontal: size.gutter },
});
