// A list of work the patient had done before this system recorded it, and the
// two questions adding one asks: which procedure, and — through
// `HistoricalDateSheet` — which day.
//
// It is one component because there are two places to add such a procedure and
// they must not drift: the **Old patient** block on a registration
// (`OldPatientCard`), and the editor on a record that already exists
// (`PatientEditScreen`). What differs between them is where the list is sent,
// which is `patientForm.ts`'s business and not this file's — here they differ
// only by their eyebrow.
//
// The catalogue sheet and the tooth sheet are the day cluster's, reused rather
// than redrawn: a procedure the doctor may record is exactly a procedure the
// old system may have recorded, and a second catalogue would be a second thing
// to keep in step with §5. They are driven by the day cluster's own query hook
// for one reason — `ProcedureSheet` takes a `RequestError` and that hook is
// what produces one.
//
// A date is optional on every entry and blank is not an omission: the file says
// what was done and not always when. Blank goes to the server as nothing and
// the record draws it as *before migration*.
import type { Tooth } from '@lustre/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AddButton, Callout, Card, CardDivider, duration } from '../../../components/ui';
import { useT } from '../../../i18n';
import { border, color, radius, space, Text } from '../../../theme';
import { type PickedProcedure, ProcedureSheet } from '../../day/components/ProcedureSheet';
import { ToothSheet } from '../../day/components/ToothSheet';
import { api as dayApi, useLocalQuery } from '../../day/data';
import { formatLongDate } from '../../day/time';
import type { HistoricalProcedureDraft } from '../patientForm';
import { HistoricalDateSheet } from './HistoricalDateSheet';
import { CloseIcon } from './icons';

export type HistoricalProceduresProps = {
    /** The eyebrow over the list — what these procedures are called in this place. */
    title: string;
    entries: HistoricalProcedureDraft[];
    onChange: (entries: HistoricalProcedureDraft[]) => void;
    /**
     * Whether the catalogue is worth fetching yet. The registration block is
     * behind a switch that is off by default, and most registrations never turn
     * it on — a tree fetched for every one of them is a request over Tailscale
     * for a list nobody is going to open.
     */
    enabled?: boolean;
};

/** Which question is open: the catalogue, the tooth a pick turned out to owe, or an entry's date. */
type Asking =
    | null
    | { step: 'procedure' }
    | { step: 'toothFor'; picked: PickedProcedure }
    | { step: 'dateFor'; entryId: string };

export function HistoricalProcedures({
    title,
    entries,
    onChange,
    enabled = true,
}: HistoricalProceduresProps) {
    const t = useT();
    const [asking, setAsking] = useState<Asking>(null);

    const catalogue = useLocalQuery('patients:procedureTree', () => dayApi.procedureTree(), { enabled });

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
        const entry: HistoricalProcedureDraft = {
            id: `old-${Date.now()}-${entries.length}`,
            procedureId: picked.procedureId,
            name: picked.variant ? `${picked.name} — ${picked.variant}` : picked.name,
            tooth,
            // Undated until the desk says otherwise, which is the honest state
            // for a procedure whose date nobody has been asked for yet.
            performedOn: null,
        };
        onChange([...entries, entry]);
        setAsking(null);
    }

    function setDate(entryId: string, performedOn: string | null) {
        onChange(entries.map((row) => (row.id === entryId ? { ...row, performedOn } : row)));
    }

    const dating = asking?.step === 'dateFor' ? entries.find((row) => row.id === asking.entryId) : undefined;

    return (
        <View>
            <View style={styles.history}>
                <View style={styles.historyHead}>
                    <Text variant="eyebrow" tone="muted">
                        {t(title)}
                    </Text>
                    <Text variant="caption" tone="muted">
                        {entries.length === 0
                            ? t('Optional')
                            : t(entries.length === 1 ? '{count} entry' : '{count} entries', {
                                  count: entries.length,
                              })}
                    </Text>
                </View>

                {entries.length === 0 ? (
                    <Text variant="caption" tone="muted">
                        {t(
                            "Work done before this system recorded it. It shows in this patient's history, marked as imported, and never adds to what they owe.",
                        )}
                    </Text>
                ) : (
                    <Card>
                        {entries.map((entry, index) => (
                            <View key={entry.id}>
                                {index > 0 ? <CardDivider /> : null}
                                <HistoricalProcedureRow
                                    entry={entry}
                                    onDate={() => setAsking({ step: 'dateFor', entryId: entry.id })}
                                    onRemove={() => onChange(entries.filter((row) => row.id !== entry.id))}
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
                        The rest of the form still saves — the previous procedures are the only part that
                        needs the catalogue.
                    </Callout>
                ) : null}
            </View>

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

            {/* Keyed by the entry so each open starts on that row's own month
                rather than on the last row's — the sheet seeds its state once. */}
            <HistoricalDateSheet
                key={dating?.id ?? 'none'}
                visible={dating !== undefined}
                selected={dating?.performedOn ?? null}
                procedureName={dating?.name}
                onPick={(performedOn) => {
                    if (dating) setDate(dating.id, performedOn);
                }}
                onClose={() => setAsking(null)}
            />
        </View>
    );
}

/**
 * One entry: what was done, the day it was done if the file says, and a way to
 * take it back off before saving.
 *
 * The date is a button rather than a field. It used to be `DDMMYYYY` on a
 * number pad, which could be half-typed, could name the 31st of February and
 * could name next year, so the row carried an error line under it and the save
 * had to count the bad ones. A sheet of real days can produce none of those.
 *
 * Two lines, not three columns. With the date squeezed between the name and the
 * remove button it had the width of a word.
 */
function HistoricalProcedureRow({
    entry,
    onDate,
    onRemove,
}: {
    entry: HistoricalProcedureDraft;
    onDate: () => void;
    onRemove: () => void;
}) {
    const t = useT();

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
                    accessibilityLabel={t('Remove {name}', { name: entry.name })}
                    onPress={onRemove}
                    hitSlop={10}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                    testID={`patient-old-remove-${entry.id}`}
                >
                    <CloseIcon size={13} stroke={color.muted} />
                </Pressable>
            </View>

            <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                    entry.performedOn === null
                        ? t('Date of {name}: not set', { name: entry.name })
                        : t('Date of {name}: {date}', {
                              name: entry.name,
                              date: formatLongDate(entry.performedOn),
                          })
                }
                onPress={onDate}
                style={({ pressed }) => [styles.date, pressed && styles.pressed]}
                testID={`patient-old-date-${entry.id}`}
            >
                <Text variant="caption" tone="muted">
                    {t('Date')}
                </Text>
                {/* The default said out loud. An undated entry is the common
                    case, and a blank here would read as a field nobody filled
                    in rather than as the answer the record will show. */}
                <Text variant="callout" weight="medium" tone={entry.performedOn === null ? 'muted' : 'ink'}>
                    {entry.performedOn === null ? t('Before migration') : formatLongDate(entry.performedOn)}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    history: { paddingTop: space[4], gap: space[2.5] },
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
    date: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: space[3],
        paddingHorizontal: space[3],
        paddingVertical: space[2.5],
        borderRadius: radius.md,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface2,
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
