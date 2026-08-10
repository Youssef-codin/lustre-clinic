/**
 * A walk-in: someone is at the desk now, and they are going in. §7 —
 * `appointment.walkIn` books and checks in at once at `now`, subject to the
 * same exclusion constraint as anything else — so the busy clinic's failure
 * gets its specific sentence, in this sheet, above the button, never a toast
 * that slides away. The patient search is debounced because every keystroke is
 * otherwise a round trip to a clinic PC over Tailscale, and debouncing keeps
 * the answers arriving in the order they were asked. Changing the duration
 * resets the last walk-in error, which was about the old length.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
    Button,
    Callout,
    Chip,
    SearchField,
    SegmentedControl,
    Sheet,
    TextField,
} from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { api, type Patient, useLocalMutation, useLocalQuery } from '../data';
import { describeError } from '../errors';
import { localOffsetMinutes } from '../time';
import { useDebounced } from '../useDebounced';

export type WalkInSheetProps = {
    visible: boolean;
    branchId: string | null;
    durationOptions: readonly number[];
    defaultDuration: number;
    onClose: () => void;
    onCreated: (message: string) => void;
};

type Mode = 'existing' | 'new';

const MODES = [
    { value: 'existing', label: 'On file' },
    { value: 'new', label: 'New patient' },
] as const satisfies readonly { value: Mode; label: string }[];

export function WalkInSheet({
    visible,
    branchId,
    durationOptions,
    defaultDuration,
    onClose,
    onCreated,
}: WalkInSheetProps) {
    const [mode, setMode] = useState<Mode>('existing');
    const [term, setTerm] = useState('');
    const [picked, setPicked] = useState<Patient | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [duration, setDuration] = useState(defaultDuration);

    const query = useDebounced(term.trim(), 250);

    const search = useLocalQuery<Patient[]>(
        `patients:${query}`,
        () => (query.length >= 2 ? api.searchPatients(query) : Promise.resolve([])),
        { enabled: visible && mode === 'existing' },
    );

    const walkIn = useLocalMutation(api.walkIn);

    const ready =
        branchId !== null &&
        (mode === 'existing' ? picked !== null : name.trim().length > 0 && phone.trim().length >= 5);

    function submit() {
        if (!branchId || !ready) return;

        walkIn.mutate(
            {
                patient:
                    mode === 'existing' && picked
                        ? { kind: 'existing', patientId: picked.id }
                        : { kind: 'new', name: name.trim(), phone: phone.trim() },
                branchId,
                durationMinutes: duration,
                offsetMinutes: localOffsetMinutes(),
            },
            {
                onSuccess: () => {
                    onCreated('Walk-in checked in');
                    onClose();
                },
            },
        );
    }

    const failure = walkIn.error ? describeError(walkIn.error, 'walk-in') : null;

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            dismissable={!walkIn.pending}
            title="Walk-in"
            subtitle="Booked and checked in, starting now."
            testID="walk-in-sheet"
            footer={
                <Button
                    label="Start the visit"
                    block
                    loading={walkIn.pending}
                    disabled={!ready}
                    onPress={submit}
                />
            }
        >
            {failure ? (
                <View style={styles.failure}>
                    <Callout tone="warning" title={failure.title}>
                        {failure.body ?? ''}
                    </Callout>
                </View>
            ) : null}

            <SegmentedControl
                segments={MODES}
                value={mode}
                onChange={(next) => {
                    setMode(next);
                    walkIn.reset();
                }}
                accessibilityLabel="Is the patient on file"
            />

            {mode === 'existing' ? (
                <View style={styles.section}>
                    <SearchField
                        value={term}
                        onChangeText={(next) => {
                            setTerm(next);
                            setPicked(null);
                        }}
                        onClear={() => {
                            setTerm('');
                            setPicked(null);
                        }}
                        variant="sheet"
                        placeholder="Name or phone"
                        autoCorrect={false}
                    />

                    <PatientResults
                        term={term}
                        results={search.data ?? []}
                        loading={search.status === 'loading'}
                        failed={search.status === 'error'}
                        picked={picked}
                        onPick={setPicked}
                        onRetry={search.refetch}
                    />
                </View>
            ) : (
                <View style={styles.section}>
                    <TextField
                        label="Name"
                        required
                        value={name}
                        onChangeText={setName}
                        autoCorrect={false}
                    />
                    <TextField
                        label="Phone"
                        required
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        hint="As it is dialled — 010 1234 5678."
                    />
                    <Text variant="caption" tone="muted">
                        The patient record is created with the visit. The rest of their details can be filled
                        in later.
                    </Text>
                </View>
            )}

            <View style={styles.section}>
                <Text variant="eyebrow" tone="muted">
                    HOW LONG
                </Text>
                <View style={styles.durations}>
                    {durationOptions.map((option) => (
                        <Chip
                            key={option}
                            label={`${option} min`}
                            grow
                            selected={duration === option}
                            onPress={() => {
                                setDuration(option);
                                walkIn.reset();
                            }}
                        />
                    ))}
                </View>
            </View>

            {branchId === null ? (
                <View style={styles.section}>
                    <Callout tone="warning" title="No branch to book into">
                        The clinic’s branches could not be loaded, so there is nowhere to put this visit.
                    </Callout>
                </View>
            ) : null}
        </Sheet>
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
    failure: { marginBottom: space[4] },
    section: { marginTop: space[4], gap: space[3] },
    durations: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
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
