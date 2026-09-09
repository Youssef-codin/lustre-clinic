/**
 * Who the booking is for — what `BookPatientSheet` asks, and a component rather
 * than part of it because the same question is asked from the patient record,
 * where the answer is already known and the sheet is skipped entirely
 * (`draftFor`).
 *
 * The search is debounced because every keystroke is otherwise a round trip to
 * a clinic PC over Tailscale, and debouncing keeps the answers arriving in the
 * order they were asked. The state lives in the caller (`PatientDraft`, in
 * `patientDraft.ts` with the rules that judge it) because the answer outlives
 * this component: it is what gets carried to the booking page after the sheet
 * closes.
 *
 * Registering someone is no longer asked here. It used to be the other half of
 * a segmented control — the whole patient record, every field of it, inside a
 * bottom sheet sitting on top of the keyboard. It is a page-sized form and there
 * is already a page for it, so `onRegisterNew` hands the question to
 * `PatientEditScreen` and the answer comes back as a patient on file like any
 * other. What that changes, and it is not nothing: the record is now written
 * when the editor saves rather than with the booking, so a secretary who
 * registers someone and then abandons the booking leaves a patient behind with
 * no appointment. That is the accepted cost of reusing the real editor; the
 * booking's own `{ kind: 'new' }` path is still in `patientRefOf` and is what
 * the walk-in contract is written against.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, SearchField } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { api, type Patient, useLocalQuery } from '../data';
import type { PatientDraft } from '../patientDraft';
import { useDebounced } from '../useDebounced';

export type PatientPickerProps = {
    value: PatientDraft;
    onChange: (next: PatientDraft) => void;
    /** The sheet is open — the search does not run behind a closed one. */
    active: boolean;
    /** Leave for the patient editor. The sheet closes; the draft does not survive it. */
    onRegisterNew: () => void;
};

export function PatientPicker({ value, onChange, active, onRegisterNew }: PatientPickerProps) {
    const query = useDebounced(value.term.trim(), 250);

    const search = useLocalQuery<Patient[]>(
        `patients:${query}`,
        () => (query.length >= 2 ? api.searchPatients(query) : Promise.resolve([])),
        { enabled: active },
    );

    return (
        <View style={styles.step}>
            <View style={styles.section}>
                <SearchField
                    value={value.term}
                    onChangeText={(term) => onChange({ ...value, term, picked: null })}
                    onClear={() => onChange({ ...value, term: '', picked: null })}
                    variant="sheet"
                    placeholder="Name or phone"
                    autoCorrect={false}
                />

                <PatientResults
                    term={value.term}
                    results={search.data ?? []}
                    loading={search.status === 'loading'}
                    failed={search.status === 'error'}
                    picked={value.picked}
                    onPick={(picked) => onChange({ ...value, picked })}
                    onRetry={search.refetch}
                />
            </View>

            <View style={styles.register}>
                <Text variant="subhead" tone="muted">
                    Not been here before?
                </Text>
                <Button
                    label="Register a new patient"
                    variant="text"
                    size="md"
                    onPress={onRegisterNew}
                    testID="book-register-new"
                />
            </View>
        </View>
    );
}

function PatientResults({
    term,
    results,
    loading,
    failed,
    picked,
    onPick,
    onRetry,
}: {
    term: string;
    results: readonly Patient[];
    loading: boolean;
    failed: boolean;
    picked: Patient | null;
    onPick: (patient: Patient) => void;
    onRetry: () => void;
}) {
    if (term.trim().length < 2) {
        return (
            <Text variant="subhead" tone="muted">
                Type two letters of a name, or part of a phone number.
            </Text>
        );
    }

    if (loading) {
        return (
            <Text variant="subhead" tone="muted">
                Searching…
            </Text>
        );
    }

    if (failed) {
        return (
            <View style={styles.resultsError}>
                <Text variant="subhead" tone="due">
                    The patient list could not be searched.
                </Text>
                <Button label="Try again" variant="text" size="md" onPress={onRetry} />
            </View>
        );
    }

    if (results.length === 0) {
        return (
            <Text variant="subhead" tone="muted">
                Nobody matches. If they are new here, register them below.
            </Text>
        );
    }

    return (
        <View style={styles.results}>
            {results.map((patient) => (
                <Pressable
                    key={patient.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked?.id === patient.id }}
                    onPress={() => onPick(patient)}
                    style={({ pressed }) => [
                        styles.result,
                        picked?.id === patient.id && styles.resultPicked,
                        pressed && styles.resultPressed,
                    ]}
                >
                    <Text variant="body" weight="medium" numberOfLines={1}>
                        {patient.name}
                    </Text>
                    <Text variant="subhead" tone="muted">
                        {patient.phone}
                    </Text>
                </Pressable>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    step: { gap: space[4] },
    section: { gap: space[3] },
    // Sits under the results rather than beside the search, so it reads as what
    // to do when the search has failed to find them — which is when it is wanted.
    register: {
        gap: space[1],
        paddingTop: space[2],
        borderTopWidth: border.hair,
        borderTopColor: color.line,
    },
    results: { gap: space[2] },
    resultsError: { gap: space[2] },
    result: {
        minHeight: size.row,
        justifyContent: 'center',
        gap: space[0.5],
        paddingHorizontal: space[3],
        paddingVertical: space[2],
        borderRadius: radius.md,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    resultPicked: { borderColor: color.ink, borderWidth: border.thick },
    resultPressed: { backgroundColor: color.surface2 },
});
