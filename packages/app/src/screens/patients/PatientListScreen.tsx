// Every patient, and the search over them — `patients-list.html`, followed
// structurally: the heading with the size of the register beside it and the one
// way to add to it opposite, the search, then RECENT and the rows.
//
// Layout notes that are the design's and not defaults: the list is full-bleed
// with a hairline above every row, not cards — the register runs edge to edge,
// and a white rounded block per row stripes it and turns each patient into an
// object of their own. The RECENT label carries no count; the count is beside
// the heading, where it is the whole register rather than the length of a page.
//
// Arabic and Latin names are one list — rows set no face and `<Text>` picks the
// script per string (§6). Order is the server's (newest first); the A–Z grouping
// the design's own note describes is not drawn in it and is not invented here.
//
// The list opens on `patient.recent` and switches to `patient.search` once
// something is typed: `search` answers `[]` for an empty term by design, so
// browsing is its own procedure. Capped at the query limit (25), so a plain
// ScrollView beats a FlatList. Balances are a separate query so a money failure
// costs only the row's amount. A refresh that failed over an existing list
// leaves it up — stale, not gone (§7.14). The search is debounced because it
// runs over Tailscale; stale answers are dropped by `useQuery`.
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, EmptyState, SearchField, SectionLabel, Toast, usePullToRefresh } from '../../components/ui';
import { color, radius, size, space, Text } from '../../theme';
import { _LocalPatientRow } from './components/_LocalPatientRow';
import { SkeletonRows } from './components/_LocalSkeleton';
import { PlusIcon, SearchIcon } from './components/icons';
import { useQuery } from './data/_LocalQuery';
import { patientsApi } from './data/api';
import { errorText } from './data/errors';
import type { Patient } from './data/types';

export type PatientListScreenProps = {
    onOpen: (patientId: string) => void;
    /**
     * Registering someone from here — `PatientEditScreen`, which the cluster
     * above routes to. Still optional so the screen can be mounted on its own
     * (a gallery, a test); without a handler the button says where the flow
     * lives rather than going missing, which is the rule the record's openers
     * already follow.
     */
    onNewPatient?: () => void;
};

const DEBOUNCE_MS = 250;

export function PatientListScreen({ onNewPatient, onOpen }: PatientListScreenProps) {
    const [term, setTerm] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const query = useDebounced(term, DEBOUNCE_MS);
    const searching = query.trim().length > 0;

    // Two queries rather than one keyed by the term: leaving the recent page
    // mounted means clearing the search puts it straight back without a round
    // trip, and the register's size stays on the heading while typing.
    //
    // Idle, the search resolves to `undefined` rather than `[]` — `[]` is an
    // answer, and the first keystroke would spend the round trip showing "No
    // patients found" instead of the skeleton.
    const recent = useQuery(() => patientsApi.recent(), []);
    const results = useQuery(
        (): Promise<Patient[] | undefined> =>
            searching ? patientsApi.search(query) : Promise.resolve(undefined),
        [query],
    );

    const balances = useQuery(() => patientsApi.outstanding(), []);
    const dueByPatient = new Map((balances.data ?? []).map((row) => [row.patientId, row.balance]));

    const list = searching ? results : recent;
    const rows = searching ? (results.data ?? []) : (recent.data?.patients ?? []);

    // Both queries, and no further than that: the record behind a row is read
    // when it is opened, and the other tabs are refreshed by their own pull. A
    // refresh while searching re-runs the search, not the whole list — the term
    // is the query key, so this is the list on screen.
    const refreshControl = usePullToRefresh(() => {
        list.refetch();
        balances.refetch();
    }, list.loading || balances.loading);

    return (
        <View style={styles.screen}>
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                refreshControl={refreshControl}
            >
                <ListHeader
                    total={recent.data?.total}
                    onNewPatient={
                        onNewPatient ?? (() => setToast('Registering a patient is not wired up here yet.'))
                    }
                />

                <View style={styles.search}>
                    <SearchField
                        value={term}
                        onChangeText={setTerm}
                        onClear={() => setTerm('')}
                        placeholder="Name or phone number"
                        leading={<SearchIcon size={17} stroke={color.muted} />}
                        autoCorrect={false}
                        returnKeyType="search"
                        testID="patient-search"
                    />
                </View>

                {list.error && list.data && (
                    <View style={styles.inset}>
                        <Banner tone="warning" message="Could not refresh. Showing the last results." />
                    </View>
                )}

                {list.loading && !list.data ? (
                    <SkeletonRows count={7} ruled />
                ) : list.error && !list.data ? (
                    <EmptyState
                        title="Could not reach the clinic"
                        body={errorText(list.error)}
                        actionLabel="Try again"
                        onAction={list.refetch}
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
                    <View>
                        <SectionLabel>{searching ? 'RESULTS' : 'RECENT'}</SectionLabel>
                        {rows.map((patient) => (
                            <_LocalPatientRow
                                key={patient.id}
                                patient={patient}
                                due={dueByPatient.get(patient.id) ?? 0}
                                onPress={() => onOpen(patient.id)}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>

            <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
        </View>
    );
}

/**
 * The design's heading: the word, the size of the register on its baseline, and
 * `New patient` opposite. The count is the clinic's total, not the length of the
 * page on screen — a list capped at 25 saying `25` next to `Patients` would read
 * as the whole register. It is absent until the number is known rather than
 * animating up from zero.
 */
function ListHeader({ total, onNewPatient }: { total?: number; onNewPatient: () => void }) {
    return (
        <View style={styles.header}>
            <View style={styles.titles}>
                <Text variant="title" accessibilityRole="header">
                    Patients
                </Text>
                {total === undefined ? null : (
                    <Text variant="footnote" weight="medium" tone="muted" script="mono">
                        {grouped(total)}
                    </Text>
                )}
            </View>

            <NewPatientButton onPress={onNewPatient} />
        </View>
    );
}

/**
 * A filled `ink` pill, not `ui/AddButton` — that one is a dashed accent affordance
 * for the end of a list, and this is the screen's one solid action, drawn small
 * and dark opposite the heading. `ui/Button` is 44px at its shortest, which is
 * the height of something you commit to rather than a control riding on a
 * heading's baseline.
 */
function NewPatientButton({ onPress }: { onPress: () => void }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="New patient"
            onPress={onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.newPatient, pressed && styles.pressed]}
            testID="new-patient"
        >
            <PlusIcon size={15} stroke={color.inverse} />
            <Text variant="subhead" weight="semibold" tone="inverse">
                New patient
            </Text>
        </Pressable>
    );
}

/** `1284` → `1,284`. Written out rather than left to `Intl`, which Hermes ships cut-down. */
function grouped(value: number): string {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
    content: { paddingBottom: space[12] },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        paddingHorizontal: size.gutter,
        paddingTop: space[2],
        paddingBottom: space[2.5],
    },
    titles: { flexDirection: 'row', alignItems: 'baseline', gap: space[2.5] },
    newPatient: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1.5],
        paddingHorizontal: space[3.5],
        paddingVertical: space[2.5],
        borderRadius: radius.full,
        backgroundColor: color.ink,
    },
    pressed: { opacity: 0.72 },

    search: { paddingHorizontal: size.gutter, paddingBottom: space[3] },
    inset: { paddingHorizontal: size.gutter, paddingBottom: space[2] },
});
