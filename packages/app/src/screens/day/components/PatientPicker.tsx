/**
 * Who the booking is for — what `BookPatientSheet` asks, and a component rather
 * than part of it because the same question is asked from the patient record,
 * where the answer is already known and the sheet is skipped entirely
 * (`draftFor`).
 *
 * The search is debounced because every keystroke is otherwise a round trip to
 * a clinic PC over Tailscale, and debouncing keeps the answers arriving in the
 * order they were asked. The state lives in the caller (`PatientDraft`) because
 * the answer outlives this component: it is what gets carried to the booking
 * page after the sheet closes.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, SearchField, SegmentedControl, TextField } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { api, type Patient, type PatientRef, useLocalQuery } from '../data';
import { useDebounced } from '../useDebounced';

export type PatientDraft = {
    mode: 'existing' | 'new';
    term: string;
    picked: Patient | null;
    name: string;
    phone: string;
};

export const EMPTY_PATIENT_DRAFT: PatientDraft = {
    mode: 'existing',
    term: '',
    picked: null,
    name: '',
    phone: '',
};

const MODES = [
    { value: 'existing', label: 'On file' },
    { value: 'new', label: 'New patient' },
] as const satisfies readonly { value: PatientDraft['mode']; label: string }[];

/** What the mutation takes, or null while the draft cannot be booked. */
export function patientRefOf(draft: PatientDraft): PatientRef | null {
    if (draft.mode === 'existing') {
        return draft.picked ? { kind: 'existing', patientId: draft.picked.id } : null;
    }

    const name = draft.name.trim();
    const phone = draft.phone.trim();
    return name.length > 0 && phone.length >= 5 ? { kind: 'new', name, phone } : null;
}

/** What the booking page calls them — a new patient is named before they have an id. */
export function patientNameOf(draft: PatientDraft): string {
    return draft.mode === 'existing' ? (draft.picked?.name ?? '') : draft.name.trim();
}

export function patientPhoneOf(draft: PatientDraft): string {
    return draft.mode === 'existing' ? (draft.picked?.phone ?? '') : draft.phone.trim();
}

/** The way in for a screen that already knows the patient — the record's Book. */
export function draftFor(patient: Patient): PatientDraft {
    return { ...EMPTY_PATIENT_DRAFT, picked: patient };
}

export type PatientPickerProps = {
    value: PatientDraft;
    onChange: (next: PatientDraft) => void;
    /** The sheet is open — the search does not run behind a closed one. */
    active: boolean;
};

export function PatientPicker({ value, onChange, active }: PatientPickerProps) {
    const query = useDebounced(value.term.trim(), 250);

    const search = useLocalQuery<Patient[]>(
        `patients:${query}`,
        () => (query.length >= 2 ? api.searchPatients(query) : Promise.resolve([])),
        { enabled: active && value.mode === 'existing' },
    );

    return (
        <View style={styles.step}>
            <SegmentedControl
                segments={MODES}
                value={value.mode}
                onChange={(mode) => onChange({ ...value, mode })}
                accessibilityLabel="Is the patient on file"
            />

            {value.mode === 'existing' ? (
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
            ) : (
                <View style={styles.section}>
                    <TextField
                        label="Name"
                        required
                        value={value.name}
                        onChangeText={(name) => onChange({ ...value, name })}
                        autoCorrect={false}
                    />
                    <TextField
                        label="Phone"
                        required
                        value={value.phone}
                        onChangeText={(phone) => onChange({ ...value, phone })}
                        keyboardType="phone-pad"
                        hint="As it is dialled — 010 1234 5678."
                    />
                    <Text variant="caption" tone="muted">
                        The patient record is created with the booking. The rest of their details can be
                        filled in later.
                    </Text>
                </View>
            )}
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
                Nobody matches. If they are new, switch to New patient.
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
