// The **Old patient** block of the New patient screen: the switch, and the
// three things a patient the clinic already had brings with them.
//
// There is no mockup for it — the Open Design folder has fourteen screens and
// none of them is this one — so it is built from the tokens and from the shapes
// `patient-edit.html` already settles: an eyebrow, a card of ruled rows, and a
// list under its own eyebrow. Recorded in DECISIONS.md rather than passed off
// as drawn.
//
// Off is the default and off sends nothing. The fields keep what is in them
// while the switch is off rather than being wiped — a mis-tap that lost a typed
// number would be worse than one that did not — and only the submit reads the
// switch (`patientForm.createInputOf`).
//
// ## Three fields, and why only three
//
// The number on the paper file, what they owed on it, and what the file says
// was done. Nothing about the *cutoff* is here: which branch and which date the
// carried-over history hangs on is a fact about the clinic, answered once in
// Settings → Clinic, not four hundred times at the desk. The old Data entry
// screen asked for it per session and this is the thing that replaced it.
//
// ## The procedure list
//
// The catalogue sheet and the tooth sheet are the day cluster's, reused rather
// than redrawn: a procedure the doctor may record is exactly a procedure the
// old system may have recorded, and a second catalogue would be a second thing
// to keep in step with §5. They are driven by the day cluster's own query hook
// for one reason — `ProcedureSheet` takes a `RequestError` and that hook is
// what produces one.
//
// A date is optional on every entry, and blank is not an omission: the paper
// file often says what was done and not when. Blank goes to the server as
// nothing and the record draws it as *before migration*.
import type { Tooth } from '@lustre/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
    AddButton,
    Callout,
    Card,
    CardDivider,
    duration,
    NumericField,
    Switch,
    TextField,
} from '../../../components/ui';
import { border, color, radius, space, Text } from '../../../theme';
import { type PickedProcedure, ProcedureSheet } from '../../day/components/ProcedureSheet';
import { ToothSheet } from '../../day/components/ToothSheet';
import { api as dayApi, useLocalQuery } from '../../day/data';
import type { OldField, OldPatientForm, OldProcedureDraft, PatientForm } from '../patientForm';
import { oldDateDigits, oldDateDisplay, oldDateError, owesInput } from '../patientForm';
import { CloseIcon } from './icons';

export type OldPatientCardProps = {
    form: PatientForm;
    onChange: (patch: Partial<PatientForm>) => void;
    /** Required and still empty — the label goes `due` and the footer counts it. */
    blank: OldField[];
    /** Typed and wrong, which does have something to correct. */
    errors: Partial<Record<OldField, string>>;
};

/** Which question is open: the catalogue, or the tooth a pick turned out to owe. */
type Asking = null | { step: 'procedure' } | { step: 'toothFor'; picked: PickedProcedure };

export function OldPatientCard({ form, onChange, blank, errors }: OldPatientCardProps) {
    const [asking, setAsking] = useState<Asking>(null);

    const catalogue = useLocalQuery('patients:procedureTree', () => dayApi.procedureTree(), {
        enabled: form.old.on,
    });

    const old = form.old;
    const change = (patch: Partial<OldPatientForm>) => onChange({ old: { ...old, ...patch } });

    /**
     * The sheet offers the whole catalogue, so a pick can arrive owing a tooth.
     * Ask for it before the entry exists — §5 refuses the line without one, and
     * an entry that the save then throws away is worse than a second question.
     * Both sheets are `Modal`s, so the second waits out the first's exit rather
     * than racing it into the silent drop iOS does otherwise.
     */
    function pick(picked: PickedProcedure) {
        if (picked.needsTooth) {
            setAsking(null);
            setTimeout(() => setAsking({ step: 'toothFor', picked }), duration.sheet);
            return;
        }
        add(picked, null);
    }

    function add(picked: PickedProcedure, tooth: Tooth | null) {
        const entry: OldProcedureDraft = {
            id: `old-${Date.now()}-${old.procedures.length}`,
            procedureId: picked.procedureId,
            name: picked.variant ? `${picked.name} — ${picked.variant}` : picked.name,
            tooth,
            dateDigits: '',
        };
        change({ procedures: [...old.procedures, entry] });
        setAsking(null);
    }

    return (
        <View style={styles.block}>
            <Text variant="eyebrow" tone="muted" style={styles.eyebrow}>
                OLD PATIENT
            </Text>

            <Card>
                <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                        <Text variant="callout" weight="medium">
                            Already a patient here
                        </Text>
                        <Text variant="caption" tone="muted">
                            They have a number from before the clinic moved over.
                        </Text>
                    </View>
                    <Switch
                        value={old.on}
                        onValueChange={(on) => change({ on })}
                        accessibilityLabel="Old patient"
                        testID="patient-old-switch"
                    />
                </View>

                {old.on ? (
                    <>
                        <CardDivider />
                        <View style={styles.fields}>
                            <TextField
                                label="Old ref number"
                                required
                                value={old.ref}
                                onChangeText={(ref) => change({ ref })}
                                placeholder="710"
                                due={blank.includes('ref')}
                                hint="The number on the front of their paper file. It becomes their patient number here."
                                autoCapitalize="characters"
                                testID="patient-old-ref"
                            />
                            <NumericField
                                label="Owes"
                                value={old.owes}
                                onChangeText={(text) => change({ owes: owesInput(text) })}
                                placeholder="0"
                                prefix="EGP"
                                error={errors.owes}
                                keyboardType="number-pad"
                                size="body"
                                hint="What they still owed the old system. Leave blank if nothing."
                                testID="patient-old-owes"
                            />
                        </View>
                    </>
                ) : null}
            </Card>

            {old.on ? (
                <View style={styles.history}>
                    <View style={styles.historyHead}>
                        <Text variant="eyebrow" tone="muted">
                            OLD PROCEDURES
                        </Text>
                        <Text variant="caption" tone="muted">
                            {old.procedures.length === 0
                                ? 'Optional'
                                : `${old.procedures.length} entr${old.procedures.length === 1 ? 'y' : 'ies'}`}
                        </Text>
                    </View>

                    {old.procedures.length === 0 ? (
                        <Text variant="caption" tone="muted">
                            What the old system recorded. It shows in this patient's history, marked as
                            imported, and never adds to what they owe.
                        </Text>
                    ) : (
                        <Card>
                            {old.procedures.map((entry, index) => (
                                <View key={entry.id}>
                                    {index > 0 ? <CardDivider /> : null}
                                    <OldProcedureRow
                                        entry={entry}
                                        onDate={(dateDigits) =>
                                            change({
                                                procedures: old.procedures.map((row) =>
                                                    row.id === entry.id ? { ...row, dateDigits } : row,
                                                ),
                                            })
                                        }
                                        onRemove={() =>
                                            change({
                                                procedures: old.procedures.filter(
                                                    (row) => row.id !== entry.id,
                                                ),
                                            })
                                        }
                                    />
                                </View>
                            ))}
                        </Card>
                    )}

                    <AddButton
                        label="Add a procedure"
                        onPress={() => setAsking({ step: 'procedure' })}
                        testID="patient-old-add-procedure"
                    />

                    {catalogue.error ? (
                        <Callout tone="warning" title="Could not load the procedures">
                            The rest of the registration still saves — the old procedures are the only part
                            that needs the catalogue.
                        </Callout>
                    ) : null}
                </View>
            ) : null}

            <ToothSheet
                visible={asking?.step === 'toothFor'}
                // The variant is what was tapped; the category alone reads as
                // "Surgical is done to a tooth", which names nothing.
                required={
                    asking?.step === 'toothFor' ? (asking.picked.variant ?? asking.picked.name) : undefined
                }
                onClose={() => setAsking(null)}
                onPick={(tooth) => {
                    if (asking?.step === 'toothFor') add(asking.picked, tooth);
                }}
            />

            <ProcedureSheet
                visible={asking?.step === 'procedure'}
                onClose={() => setAsking(null)}
                onPick={pick}
                categories={catalogue.data ?? []}
                loading={catalogue.status === 'loading'}
                error={catalogue.error}
                onRetry={catalogue.refetch}
                tooth={null}
            />
        </View>
    );
}

/**
 * One entry: what was done, the day it was done if the file says, and a way to
 * take it back off before saving.
 *
 * The date is `DDMMYYYY` on a number pad, the rhythm every other date in the
 * app is typed in. Blank is the honest answer and is never an error — the
 * placeholder says what blank means rather than leaving it to be guessed.
 */
function OldProcedureRow({
    entry,
    onDate,
    onRemove,
}: {
    entry: OldProcedureDraft;
    onDate: (digits: string) => void;
    onRemove: () => void;
}) {
    // Two lines, not three columns. With the date squeezed between the name
    // and the remove button it had the width of a word, and `14 / 03 / 2024`
    // showed as `024` once typed. The name and the cross share the first line;
    // the date has the second to itself.
    return (
        <View style={styles.row}>
            <View style={styles.rowHead}>
                <View style={styles.rowText}>
                    <Text variant="callout" weight="medium" numberOfLines={2}>
                        {entry.name}
                    </Text>
                    {entry.tooth ? (
                        <View style={styles.tooth}>
                            <Text variant="tag" weight="bold" script="mono">
                                {entry.tooth}
                            </Text>
                        </View>
                    ) : null}
                </View>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${entry.name}`}
                    onPress={onRemove}
                    hitSlop={10}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                    testID={`patient-old-remove-${entry.id}`}
                >
                    <CloseIcon size={13} stroke={color.muted} />
                </Pressable>
            </View>

            <NumericField
                label="Date"
                value={oldDateDisplay(entry.dateDigits)}
                onChangeText={(text) => onDate(oldDateDigits(text))}
                placeholder="Before migration"
                error={oldDateError(entry.dateDigits) ?? undefined}
                keyboardType="number-pad"
                size="body"
                variant="inline"
                layout="inline"
                testID={`patient-old-date-${entry.id}`}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    block: { paddingTop: space[4], gap: space[2] },
    eyebrow: { paddingBottom: space[1.5] },

    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
    },
    switchText: { flex: 1, gap: space[0.5] },

    fields: { paddingHorizontal: space[3.5], paddingVertical: space[3.5], gap: space[4] },

    history: { paddingTop: space[2], gap: space[2.5] },
    historyHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },

    row: { gap: space[2], paddingHorizontal: space[3.5], paddingVertical: space[2.5] },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    rowText: { flex: 1, gap: space[1], alignItems: 'flex-start' },
    tooth: {
        paddingHorizontal: space[1.5],
        paddingVertical: 2,
        borderRadius: radius.sm,
        borderWidth: border.hair,
        borderColor: color.outline,
    },
    remove: {
        width: 26,
        height: 26,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surface2,
    },
    pressed: { opacity: 0.6 },
});
