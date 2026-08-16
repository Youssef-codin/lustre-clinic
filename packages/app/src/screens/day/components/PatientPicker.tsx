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
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, SearchField, SegmentedControl, Select, Textarea, TextField } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { api, type Patient, useLocalQuery } from '../data';
import {
    birthDateDigits,
    birthDateDisplay,
    birthDateError,
    emailError,
    GENDERS,
    type PatientDraft,
} from '../patientDraft';
import { useDebounced } from '../useDebounced';

const MODES = [
    { value: 'existing', label: 'On file' },
    { value: 'new', label: 'New patient' },
] as const satisfies readonly { value: PatientDraft['mode']; label: string }[];

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

            <View style={styles.section}>
                {value.mode === 'existing' ? (
                    <>
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
                    </>
                ) : (
                    <NewPatientForm value={value} onChange={onChange} />
                )}
            </View>
        </View>
    );
}

/**
 * The record as a booking can fill it. Nothing is hidden behind a disclosure:
 * a field the secretary cannot see is a field she does not ask for, and the
 * whole point of asking here is that she has the patient in front of her. Only
 * the name and the number are required, and the caption says so.
 */
function NewPatientForm({
    value,
    onChange,
}: {
    value: PatientDraft;
    onChange: (next: PatientDraft) => void;
}) {
    const email = emailError(value.email);
    const birthDate = birthDateError(value.birthDate);

    return (
        <>
            <TextField
                label="Name"
                required
                value={value.name}
                onChangeText={(name) => onChange({ ...value, name })}
                placeholder="As it goes on the record"
                autoCorrect={false}
            />
            <TextField
                label="Phone"
                required
                value={value.phone}
                onChangeText={(phone) => onChange({ ...value, phone })}
                keyboardType="phone-pad"
                placeholder="010 1234 5678"
            />
            <TextField
                label="Email"
                value={value.email}
                onChangeText={(email) => onChange({ ...value, email })}
                error={email ?? undefined}
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="email"
            />
            <TextField
                label="Date of birth"
                value={birthDateDisplay(value.birthDate)}
                onChangeText={(text) => onChange({ ...value, birthDate: birthDateDigits(text) })}
                error={birthDate ?? undefined}
                keyboardType="number-pad"
                placeholder="DD / MM / YYYY"
            />
            <Select
                label="Sex"
                sheetTitle="Sex"
                options={GENDERS}
                value={value.gender}
                onChange={(gender) => onChange({ ...value, gender })}
                testID="new-patient-gender"
            />
            <Textarea
                label="Patient note"
                hint="Kept on the record, not on this appointment."
                value={value.notes}
                onChangeText={(notes) => onChange({ ...value, notes })}
                placeholder="Anything that is true of them every visit."
            />

            <Text variant="caption" tone="muted">
                The patient record is created with the booking. Only the name and the number are needed to
                book — the rest can be left for the desk.
            </Text>
        </>
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
