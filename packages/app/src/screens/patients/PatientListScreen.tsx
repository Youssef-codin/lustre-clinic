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
} from '../../components/ui';
import { color, size, space } from '../../theme';
import { _LocalPatientRow } from './components/_LocalPatientRow';
import { SkeletonRows } from './components/_LocalSkeleton';
import { _LocalPatientsApi } from './data/_LocalPatientsApi';
import { useQuery } from './data/_LocalQuery';
import { errorText } from './data/errors';

/**
 * Every patient, and the search over them.
 *
 * Arabic and Latin names are one list, not two — `_LocalPatientRow` sets no
 * face and `<Text>` detects the script per string (§6). Sorting and grouping
 * are the server's `patient.search` order (newest first); the A–Z grouping the
 * design describes is not drawn in it and is not invented here.
 *
 * The list is capped at the query's `limit` (25), which is why it is a plain
 * `ScrollView` and not a `FlatList` — virtualising 25 rows costs more than it
 * saves. If the cap ever lifts, this becomes a `FlatList` and nothing else
 * changes.
 */

export type PatientListScreenProps = {
    onOpen: (patientId: string) => void;
};

/** Long enough that a name is not four searches, short enough to feel typed. */
const DEBOUNCE_MS = 250;

export function PatientListScreen({ onOpen }: PatientListScreenProps) {
    const [term, setTerm] = useState('');
    const query = useDebounced(term, DEBOUNCE_MS);

    const patients = useQuery(() => _LocalPatientsApi.search(query), [query]);

    // Balances are a separate query on purpose: it is another cluster's screen
    // that owns them, it is not what this list is for, and a patient list that
    // cannot render until the money answers is a patient list that is down
    // whenever the money is. A failure here costs the row's amount, nothing else.
    const balances = useQuery(() => _LocalPatientsApi.outstanding(), []);
    const dueByPatient = new Map((balances.data ?? []).map((row) => [row.patientId, row.balance]));

    const searching = query.trim().length > 0;
    const rows = patients.data ?? [];

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

                {/* A refresh that failed over a list we already have. The list
                    stays; it is stale, not gone (§7.14). */}
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

/**
 * The search runs against a PC in the clinic over Tailscale, so it is not run
 * per keystroke. Stale answers are dropped by `useQuery` rather than by this —
 * debouncing is about how many round trips, not about which one wins.
 */
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
    content: { paddingBottom: size.nav + space[6], gap: space[3] },
    search: { paddingHorizontal: size.gutter },
    inset: { paddingHorizontal: size.gutter },
    list: { gap: space[1] },
    card: { marginHorizontal: size.gutter },
});
