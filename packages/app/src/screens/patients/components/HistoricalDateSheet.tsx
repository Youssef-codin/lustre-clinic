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
 * fetches nothing and the grid carries no state but the pick.
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
import { parseKey, todayKey } from '@lustre/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chevron, IconButton, Sheet } from '../../../components/ui';
import { useT } from '../../../i18n';
import { border, color, radius, size, space, Text } from '../../../theme';
import { addMonths, formatLongDate, formatMonth, monthDays } from '../../day/time';

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

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

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
    // rather than on this one, and re-seeded per open: the sheet is remounted
    // by `key` at the call site, which is what makes plain state enough.
    const [pending, setPending] = useState(selected);
    const [month, setMonth] = useState(selected ?? today);

    const days = monthDays(month);
    const leading = parseKey(days[0] ?? month).getDay();
    const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...days];

    function goToMonth(next: string) {
        // Paging forward stops at the month today is in — there is nothing to
        // pick beyond it, and an empty grid of disabled cells reads as broken.
        setMonth(next > today ? monthOf(today) : next);
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
            <View style={styles.monthBar}>
                <Text variant="title3" weight="semibold">
                    {formatMonth(month)}
                </Text>
                {/* `pressLockMs={0}`: paging back through years is many
                    deliberate taps, and the default lock eats half of them. */}
                <View style={styles.monthNav}>
                    <IconButton
                        accessibilityLabel={t('Previous year')}
                        icon={<DoubleChevron direction="back" />}
                        variant="square"
                        pressLockMs={0}
                        onPress={() => goToMonth(addMonths(month, -12))}
                    />
                    <IconButton
                        accessibilityLabel={t('Previous month')}
                        icon={<Chevron direction="back" tone="ink" size={9} />}
                        variant="square"
                        pressLockMs={0}
                        onPress={() => goToMonth(addMonths(month, -1))}
                    />
                    <IconButton
                        accessibilityLabel={t('Next month')}
                        icon={<Chevron direction="forward" tone="ink" size={9} />}
                        variant="square"
                        pressLockMs={0}
                        onPress={() => goToMonth(addMonths(month, 1))}
                    />
                    <IconButton
                        accessibilityLabel={t('Next year')}
                        icon={<DoubleChevron direction="forward" />}
                        variant="square"
                        pressLockMs={0}
                        onPress={() => goToMonth(addMonths(month, 12))}
                    />
                </View>
            </View>

            <View style={styles.weekdays}>
                {WEEKDAY_INITIALS.map((initial, index) => (
                    <Text
                        // biome-ignore lint/suspicious/noArrayIndexKey: two Ts and two Ss
                        key={index}
                        variant="caption"
                        script="sans"
                        weight="bold"
                        tone="muted"
                        style={styles.weekday}
                    >
                        {initial}
                    </Text>
                ))}
            </View>

            <View style={styles.grid}>
                {cells.map((day, index) => {
                    if (!day) {
                        // biome-ignore lint/suspicious/noArrayIndexKey: blank leading cell
                        return <View key={`blank-${index}`} style={styles.cell} />;
                    }

                    const ahead = day > today;
                    const picked = day === pending;

                    return (
                        <Pressable
                            key={day}
                            disabled={ahead}
                            accessibilityRole="button"
                            accessibilityState={{ selected: picked, disabled: ahead }}
                            accessibilityLabel={formatLongDate(day)}
                            onPress={() => setPending(day)}
                            style={styles.cell}
                        >
                            {/* The fill is a child of a clipped box rather than a
                                background on the pressable: Android drops the
                                corner radius when it paints a descendant's
                                background, and the clip is what does hold.
                                `day/CalendarSheet` carries the same note. */}
                            <View style={styles.cellBox}>
                                {picked ? <View style={styles.fill} /> : null}
                                {!picked && day === today ? (
                                    <View pointerEvents="none" style={styles.todayRing} />
                                ) : null}

                                <Text
                                    variant="callout"
                                    // Instrument Sans, not the cluster's mono:
                                    // DM Mono stops at 500 and a grid is read at
                                    // a glance, so it wants 700.
                                    script="sans"
                                    weight="bold"
                                    tone={picked ? 'inverse' : ahead ? 'muted' : 'ink'}
                                >
                                    {parseKey(day).getDate()}
                                </Text>
                            </View>
                        </Pressable>
                    );
                })}
            </View>

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

/** The first of the month a day falls in — what the pager clamps to. */
function monthOf(key: string): string {
    return `${key.slice(0, 7)}-01`;
}

function DoubleChevron({ direction }: { direction: 'back' | 'forward' }) {
    return (
        <View style={styles.doubleChevron}>
            <Chevron direction={direction} tone="ink" size={9} />
            <Chevron direction={direction} tone="ink" size={9} />
        </View>
    );
}

const CELL = size.row;

const styles = StyleSheet.create({
    footer: { gap: space[1] },

    monthBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[2],
        marginBottom: space[3],
    },
    monthNav: { flexDirection: 'row', gap: space[1.5] },
    doubleChevron: { flexDirection: 'row', marginStart: -3 },

    weekdays: { flexDirection: 'row' },
    weekday: { width: `${100 / 7}%`, textAlign: 'center' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space[1] },
    cell: { width: `${100 / 7}%`, height: CELL, padding: space[0.5] },
    cellBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        overflow: 'hidden',
    },
    fill: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: color.ink },
    todayRing: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        borderWidth: border.thick,
        borderColor: color.ink,
        borderRadius: radius.md,
    },

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
