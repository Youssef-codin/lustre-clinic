/**
 * When a historical procedure was done. A month grid, and a way to say the file
 * does not know.
 *
 * It is not `day/CalendarSheet`, which is the nearest-looking thing in the app.
 * That sheet exists to answer "is Thursday busy" — it fetches a month of
 * appointments, paints a load bar per day and refuses days the branch is shut —
 * and every one of those is about booking a day that has not happened. This
 * asks the opposite question about a day that has: nothing was booked, no
 * branch was open, and the only fact is which day the paper file names. So it
 * fetches nothing and the grid carries no state but the pick. The grid itself
 * is `MonthGrid`, which the record's Old visit page draws inline.
 *
 * Days after today are not offered. A procedure that has not happened is not
 * history, and the typed field this replaced had to say so in a sentence under
 * the row; a grid can simply not offer them.
 *
 * ## No date is an answer, not an omission
 *
 * The file says what was done and not always when, so *not dated* is the
 * honest reading far more often than it looks. It is on the footer as its own
 * button rather than left as "close without picking", and the record draws such
 * a row as **Before migration** instead of reading the cutoff out as though it
 * were the day. Picking a day and then deciding the file does not say it is the
 * same button, so a wrong pick is one tap to undo.
 */
import { todayKey } from '@lustre/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet } from '../../../components/ui';
import { useT } from '../../../i18n';
import { border, color, radius, space, Text } from '../../../theme';
import { formatLongDate } from '../../day/time';
import { MonthGrid } from './MonthGrid';

export type HistoricalDateSheetProps = {
    visible: boolean;
    /** The day already on the entry, or null while it carries none. */
    selected: string | null;
    /** What the entry is for, so the sheet says which procedure is being dated. */
    procedureName?: string;
    /** A `YYYY-MM-DD`, or null for *the file does not say*. */
    onPick: (performedOn: string | null) => void;
    onClose: () => void;
};

export function HistoricalDateSheet({
    visible,
    selected,
    procedureName,
    onPick,
    onClose,
}: HistoricalDateSheetProps) {
    const t = useT();
    const today = todayKey();

    // Seeded from the entry so reopening a dated row lands on its own month
    // rather than on this one.
    const [pending, setPending] = useState(selected);
    const [month, setMonth] = useState(selected ?? today);

    // Re-seeded on each open, during render rather than in an effect (which is
    // banned here, and would paint the stale month first anyway). Without this
    // the sheet remembers a pick that was made and then *cancelled*: tapping a
    // day and dismissing leaves the entry undated, and the next open would
    // still be sitting on that day as though it had been chosen.
    const [wasVisible, setWasVisible] = useState(visible);
    if (wasVisible !== visible) {
        setWasVisible(visible);
        if (visible) {
            setPending(selected);
            setMonth(selected ?? today);
        }
    }

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title={t('When was it done?')}
            subtitle={procedureName}
            testID="historical-date-sheet"
            footer={
                <View style={styles.footer}>
                    <Button
                        label={t('Use this day')}
                        block
                        disabled={pending === null}
                        onPress={() => {
                            if (pending !== null) onPick(pending);
                            onClose();
                        }}
                        testID="historical-date-use"
                    />
                    <Button
                        label={t("The file doesn't say")}
                        variant="text"
                        size="md"
                        block
                        onPress={() => {
                            onPick(null);
                            onClose();
                        }}
                        testID="historical-date-unknown"
                    />
                </View>
            }
        >
            <MonthGrid month={month} onMonth={setMonth} selected={pending} onPick={setPending} />

            <View style={styles.summary}>
                <Text variant="subhead" weight="semibold">
                    {pending === null ? t('No date') : formatLongDate(pending)}
                </Text>
                <Text variant="footnote" tone="muted">
                    {pending === null
                        ? t(
                              'Saved as prior history with no day on it — the record reads it as before migration.',
                          )
                        : t('Saved against this day and shown on it in the history.')}
                </Text>
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    footer: { gap: space[1] },

    summary: {
        marginTop: space[3.5],
        gap: space[1],
        padding: space[3.5],
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        borderWidth: border.hair,
        borderColor: color.line,
    },
});
