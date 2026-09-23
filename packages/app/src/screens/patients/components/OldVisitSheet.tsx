// A visit that happened on a day that has passed and was never typed in.
//
// It replaced **Walk-in today** on the record. A walk-in is the same shape of
// thing — unscheduled work, entered as it happens — and this clinic does not
// have walk-ins, so the button was spending the record's one secondary action
// on a flow nobody uses. An old visit dated today does what a walk-in did,
// without shuffling the live day around to make a slot for it.
//
// ## It bills, and that is the whole difference from Previous procedures
//
// The editor's Previous procedures list writes rows with **no visit** behind
// them: clinical history, never charged, excluded from every total. That is
// right for work done years ago or somewhere else. It is wrong for work this
// clinic did and forgot to enter, because the patient owes for that. So this
// writes an ordinary completed visit: priced, charged, and owed until it is
// settled through the record's existing Record payment.
//
// ## One date, no time
//
// The only thing this asks that booking does not is *which day* — and the only
// thing it does not ask is *what time*. A visit that already happened occupies
// no slot, and the server stamps it at noon UTC so the day reads back the same
// at any offset. `HistoricalDateSheet` is reused with its "no date" way out
// turned off: a visit without a day is not a visit.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MoneyValue } from '../../../components/domain';
import { AddButton, Button, Callout, Card, CardDivider, NumericField, Sheet } from '../../../components/ui';
import { useT } from '../../../i18n';
import { border, color, radius, space, Text } from '../../../theme';
import { chargeableTotal, checkupIsWaived } from '../../day/procedures';
import { formatLongDate } from '../../day/time';
import type { AddOldVisitInput } from '../data/types';
import { HistoricalDateSheet } from './HistoricalDateSheet';
import { CloseIcon } from './icons';
import { isWholePounds } from './money';
import { type ProcedurePick, ProcedurePicker } from './ProcedurePicker';

/** One line as the sheet holds it: the pick, plus the price in whole pounds as typed. */
type Line = {
    id: string;
    procedureId: string;
    name: string;
    tooth: string | null;
    /** Whole pounds, as digits. Seeded from the catalogue and editable — the desk may have charged something else. */
    pounds: string;
    isCheckup: boolean;
};

export type OldVisitSheetProps = {
    visible: boolean;
    onClose: () => void;
    patientId: string;
    patientName: string;
    isPending: boolean;
    /** Localized from `ERROR_CODE`, never parsed from the server's message (§4). */
    error: string | null;
    onSubmit: (input: AddOldVisitInput) => void;
};

type Asking = null | { step: 'procedure' } | { step: 'date' };

export function OldVisitSheet({
    visible,
    onClose,
    patientId,
    patientName,
    isPending,
    error,
    onSubmit,
}: OldVisitSheetProps) {
    const t = useT();
    const [asking, setAsking] = useState<Asking>(null);
    const [performedOn, setPerformedOn] = useState<string | null>(null);
    const [lines, setLines] = useState<Line[]>([]);

    // Cleared on each open rather than in an effect, so a visit that was
    // abandoned halfway does not come back the next time the button is tapped.
    const [wasVisible, setWasVisible] = useState(visible);
    if (wasVisible !== visible) {
        setWasVisible(visible);
        if (visible) {
            setPerformedOn(null);
            setLines([]);
            setAsking(null);
        }
    }

    function add(pick: ProcedurePick) {
        setLines((current) => [
            ...current,
            {
                id: `line-${Date.now()}-${current.length}`,
                procedureId: pick.procedureId,
                name: pick.name,
                tooth: pick.tooth,
                // The catalogue's price to start from, in whole pounds — what
                // the desk usually means. `unitPrice` still rides on the line,
                // so a different figure is a correction, not a fight.
                pounds: String(Math.round(pick.defaultPrice / 100)),
                isCheckup: pick.isCheckup,
            },
        ]);
        setAsking(null);
    }

    const priced = lines.every((line) => isWholePounds(line.pounds.trim()) || line.pounds.trim() === '');
    // The checkup waiver the server charges by (§10), so the figure shown is the one owed.
    const chargeable = lines.map((line) => ({
        unitPrice: poundsOf(line.pounds) * 100,
        quantity: 1,
        isCheckup: line.isCheckup,
    }));
    const total = chargeableTotal(chargeable, checkupIsWaived(chargeable));
    const ready = performedOn !== null && lines.length > 0 && priced;

    return (
        <Sheet
            visible={visible}
            // Not while the write is open: it crosses Tailscale, and a sheet
            // dismissed mid-flight leaves the desk unable to tell whether the
            // visit was recorded.
            onClose={isPending ? () => {} : onClose}
            title={t('Old visit')}
            subtitle={patientName}
            testID="old-visit-sheet"
            footer={
                <Button
                    label={ready ? t('Record this visit') : t('Pick a day and what was done')}
                    block
                    loading={isPending}
                    disabled={!ready || isPending}
                    onPress={() => {
                        if (!ready || performedOn === null) return;
                        onSubmit({
                            patientId,
                            performedOn,
                            procedures: lines.map((line) => ({
                                procedureId: line.procedureId,
                                quantity: 1,
                                ...(line.tooth === null ? {} : { tooth: line.tooth as never }),
                                unitPrice: poundsOf(line.pounds) * 100,
                            })),
                        });
                    }}
                    testID="old-visit-save"
                />
            }
        >
            {error ? (
                <View style={styles.callout}>
                    <Callout tone="warning" title="Not recorded">
                        {error}
                    </Callout>
                </View>
            ) : null}

            <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                    performedOn === null
                        ? t('Day of the visit: not set')
                        : t('Day of the visit: {date}', { date: formatLongDate(performedOn) })
                }
                onPress={() => setAsking({ step: 'date' })}
                style={({ pressed }) => [styles.date, pressed && styles.pressed]}
                testID="old-visit-date"
            >
                <Text variant="caption" tone="muted">
                    {t('Day')}
                </Text>
                <Text variant="callout" weight="medium" tone={performedOn === null ? 'muted' : 'ink'}>
                    {performedOn === null ? t('Pick a day') : formatLongDate(performedOn)}
                </Text>
            </Pressable>

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {lines.length === 0 ? (
                    <Text variant="caption" tone="muted" style={styles.empty}>
                        {t(
                            'What was done that day. It is charged like any other visit, so the patient will owe it.',
                        )}
                    </Text>
                ) : (
                    <Card>
                        {lines.map((line, index) => (
                            <View key={line.id}>
                                {index > 0 ? <CardDivider /> : null}
                                <LineRow
                                    line={line}
                                    onPrice={(pounds) =>
                                        setLines((current) =>
                                            current.map((row) =>
                                                row.id === line.id ? { ...row, pounds } : row,
                                            ),
                                        )
                                    }
                                    onRemove={() =>
                                        setLines((current) => current.filter((row) => row.id !== line.id))
                                    }
                                />
                            </View>
                        ))}
                    </Card>
                )}

                <AddButton
                    label="Add a procedure"
                    onPress={() => setAsking({ step: 'procedure' })}
                    testID="old-visit-add-procedure"
                />

                {lines.length > 0 ? (
                    <View style={styles.total}>
                        <Text variant="subhead" weight="semibold">
                            {t('Total')}
                        </Text>
                        <MoneyValue piastres={total} weight="semibold" />
                    </View>
                ) : null}
            </ScrollView>

            <ProcedurePicker
                visible={asking?.step === 'procedure'}
                onPicked={add}
                onClose={() => setAsking(null)}
            />

            {/* No way out without a date: a visit has to have happened on a day. */}
            <HistoricalDateSheet
                visible={asking?.step === 'date'}
                selected={performedOn}
                procedureName={patientName}
                allowUnknown={false}
                onPick={(picked) => setPerformedOn(picked)}
                onClose={() => setAsking(null)}
            />
        </Sheet>
    );
}

/** Whole pounds as typed, or zero for a blank — a line the desk did not charge for. */
function poundsOf(text: string): number {
    const trimmed = text.trim();
    if (trimmed === '' || !isWholePounds(trimmed)) return 0;
    return Number(trimmed);
}

function LineRow({
    line,
    onPrice,
    onRemove,
}: {
    line: Line;
    onPrice: (pounds: string) => void;
    onRemove: () => void;
}) {
    const t = useT();

    return (
        <View style={styles.row}>
            <View style={styles.rowHead}>
                <View style={styles.rowText}>
                    <Text variant="callout" weight="medium" numberOfLines={2}>
                        {line.name}
                    </Text>
                    {line.tooth ? (
                        <View style={styles.tooth}>
                            <Text variant="tag" weight="bold" script="mono">
                                {line.tooth}
                            </Text>
                        </View>
                    ) : null}
                </View>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Remove {name}', { name: line.name })}
                    onPress={onRemove}
                    hitSlop={10}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                    testID={`old-visit-remove-${line.id}`}
                >
                    <CloseIcon size={13} stroke={color.muted} />
                </Pressable>
            </View>

            <NumericField
                label="Price"
                value={line.pounds}
                onChangeText={(text) => onPrice(text.trim().slice(0, 8))}
                placeholder="0"
                prefix="EGP"
                error={
                    line.pounds.trim() !== '' && !isWholePounds(line.pounds.trim())
                        ? 'That is not an amount in pounds.'
                        : undefined
                }
                keyboardType="number-pad"
                size="body"
                variant="inline"
                layout="inline"
                testID={`old-visit-price-${line.id}`}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    callout: { paddingBottom: space[3] },

    date: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
        borderRadius: radius.md,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface2,
    },

    list: { marginTop: space[3] },
    empty: { paddingBottom: space[2.5] },

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

    total: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingTop: space[3.5],
    },
});
