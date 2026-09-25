// A list of work the patient had done before this system recorded it, and the
// two questions adding one asks: which procedure, and — through
// `HistoricalDateSheet` — which day.
//
// It is drawn by the **Old patient** block on a registration
// (`OldPatientCard`). Where the list is sent is `patientForm.ts`'s business and
// not this file's.
//
// Choosing the procedure is `ProcedurePicker`'s, shared with the old-visit
// sheet so that the two ways of recording past work cannot drift on the one
// question they both ask.
//
// A date is optional on every entry and blank is not an omission: the file says
// what was done and not always when. Blank goes to the server as nothing and
// the record draws it as *before migration*.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AddButton, Card, CardDivider } from '../../../components/ui';
import { useT } from '../../../i18n';
import { border, color, radius, space, Text } from '../../../theme';
import { formatLongDate } from '../../day/time';
import type { HistoricalProcedureDraft } from '../patientForm';
import { HistoricalDateSheet } from './HistoricalDateSheet';
import { CloseIcon } from './icons';
import { type ProcedurePick, ProcedurePicker } from './ProcedurePicker';

export type HistoricalProceduresProps = {
    /** The eyebrow over the list — what these procedures are called in this place. */
    title: string;
    entries: HistoricalProcedureDraft[];
    onChange: (entries: HistoricalProcedureDraft[]) => void;
    /**
     * Whether the catalogue may be fetched at all. The registration block is
     * behind a switch that is off by default, and a closed switch must not
     * spend a request on a list it is not showing.
     */
    enabled?: boolean;
};

/** Which question is open: the catalogue, or an entry's date. The tooth question is the picker's. */
type Asking = null | { step: 'procedure' } | { step: 'dateFor'; entryId: string };

export function HistoricalProcedures({
    title,
    entries,
    onChange,
    enabled = true,
}: HistoricalProceduresProps) {
    const t = useT();
    const [asking, setAsking] = useState<Asking>(null);

    function add(pick: ProcedurePick) {
        const entry: HistoricalProcedureDraft = {
            id: `old-${Date.now()}-${entries.length}`,
            procedureId: pick.procedureId,
            name: pick.name,
            tooth: pick.tooth,
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
            </View>

            <ProcedurePicker
                visible={enabled && asking?.step === 'procedure'}
                onPicked={add}
                onClose={() => setAsking(null)}
            />

            <HistoricalDateSheet
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
