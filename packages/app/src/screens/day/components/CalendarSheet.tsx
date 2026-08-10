import { SLOT_HOLDING_STATUSES } from '@mawid/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chevron, IconButton, Sheet } from '../../../components/ui';
import { border, color, radius, shadow, size, space, Text } from '../../../theme';
import { type Appointment, api, type ClinicDay, useLocalQuery } from '../data';
import { describeError } from '../errors';
import { isClosed, openMinutes } from '../hours';
import { addMonths, formatDate, formatMonth, monthDays, parseKey, time12, todayKey } from '../time';

/**
 * A month, with how full each day is.
 *
 * The load bar is the reason this is not a date picker. "Is Thursday busy" is
 * the question that gets asked over the phone, and answering it by opening
 * Thursday and counting is how someone gets double-booked while the secretary
 * is looking at the wrong day.
 *
 * The month is one request, not thirty-one: `api.byDates` batches (§4).
 */

export type CalendarSheetProps = {
    visible: boolean;
    /** The day the screen is on, which is where the grid opens. */
    selected: string;
    schedule: readonly ClinicDay[] | undefined;
    /** Named in the legend — the load shown is this branch's, not the clinic's. */
    branchName: string | undefined;
    onPick: (dateKey: string) => void;
    onClose: () => void;
};

interface DayLoad {
    count: number;
    /** 0–1 of the clinic's open minutes. Over 0.9 reads as full. */
    fill: number;
    /** ISO start of the first slot-holding appointment, for the summary. */
    firstAt: string | null;
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const FULL_AT = 0.9;

function loadsFrom(
    days: readonly string[],
    perDay: readonly Appointment[][],
    schedule: readonly ClinicDay[] | undefined,
): Map<string, DayLoad> {
    const loads = new Map<string, DayLoad>();

    days.forEach((day, index) => {
        const rows = perDay[index] ?? [];
        // Cancelled and no-show rows do not hold a slot (§7), so they do not
        // make a day look busy either.
        const holding = rows.filter((row) =>
            (SLOT_HOLDING_STATUSES as readonly string[]).includes(row.status),
        );
        const booked = holding.reduce((total, row) => total + row.durationMinutes, 0);
        const open = openMinutes(day, schedule);
        const firstAt = holding.map((row) => row.startsAt).sort((a, b) => a.localeCompare(b))[0];
        loads.set(day, {
            count: holding.length,
            fill: open > 0 ? Math.min(booked / open, 1) : 0,
            firstAt: firstAt ?? null,
        });
    });

    return loads;
}

export function CalendarSheet({
    visible,
    selected,
    schedule,
    branchName,
    onPick,
    onClose,
}: CalendarSheetProps) {
    const [month, setMonth] = useState(selected);
    const [pending, setPending] = useState(selected);

    const days = monthDays(month);
    const query = useLocalQuery(`month:${month}`, () => api.byDates(days), {
        enabled: visible,
    });

    const loads = query.data ? loadsFrom(days, query.data, schedule) : new Map<string, DayLoad>();
    const today = todayKey();

    // Blank cells before the 1st, so the columns line up with their weekday.
    const leading = parseKey(days[0] ?? month).getDay();
    const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...days];

    const pendingLoad = loads.get(pending);
    const pendingClosed = isClosed(pending, schedule);

    /**
     * The pick follows the month. Left behind, the grid highlights nothing, the
     * summary describes a day that is not on screen, and "Go to this day" goes
     * back to the day the sheet opened on — which is where the secretary
     * already was.
     */
    function goToMonth(next: string) {
        setMonth(next);
        const nextDays = monthDays(next);
        setPending(nextDays.includes(today) ? today : (nextDays[0] ?? next));
    }

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            testID="calendar-sheet"
            footer={
                <Button
                    label="Go to this day"
                    block
                    onPress={() => {
                        onPick(pending);
                        onClose();
                    }}
                />
            }
        >
            <View style={styles.monthBar}>
                <Text variant="title3" weight="semibold">
                    {formatMonth(month)}
                </Text>
                <View style={styles.monthNav}>
                    <IconButton
                        accessibilityLabel="Previous month"
                        icon={<Chevron direction="back" tone="ink" size={9} />}
                        variant="square"
                        onPress={() => goToMonth(addMonths(month, -1))}
                    />
                    <IconButton
                        accessibilityLabel="Next month"
                        icon={<Chevron direction="forward" tone="ink" size={9} />}
                        variant="square"
                        onPress={() => goToMonth(addMonths(month, 1))}
                    />
                </View>
            </View>

            <View style={styles.weekdays}>
                {WEEKDAY_INITIALS.map((initial, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: two Ts and two Ss
                    <Text key={index} variant="caption" tone="muted" style={styles.weekday}>
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

                    const load = loads.get(day);
                    const closed = isClosed(day, schedule);
                    const past = day < today;
                    const full = (load?.fill ?? 0) >= FULL_AT;

                    return (
                        <Pressable
                            key={day}
                            accessibilityRole="button"
                            accessibilityState={{ selected: day === pending }}
                            accessibilityLabel={`${day}${closed ? ', closed' : ''}${
                                load ? `, ${load.count} booked` : ''
                            }`}
                            onPress={() => setPending(day)}
                            style={styles.cell}
                        >
                            <View
                                style={[
                                    styles.cellBox,
                                    closed && styles.closed,
                                    full && styles.full,
                                    day === today && styles.today,
                                    day === pending && styles.picked,
                                ]}
                            >
                                <Text
                                    variant="callout"
                                    weight={day === pending || day === today ? 'semibold' : 'regular'}
                                    tone={day === pending ? 'inverse' : closed || past ? 'muted' : 'ink'}
                                >
                                    {parseKey(day).getDate()}
                                </Text>

                                {/* A stub whose length is the count, not a track
                                    that fills: four bookings and forty read the
                                    same on a 40px cell, and the design sizes it
                                    off the number rather than the minutes. */}
                                <View
                                    style={[
                                        styles.load,
                                        {
                                            width: Math.min(load?.count ?? 0, 4) * 4,
                                            backgroundColor:
                                                !load || closed || load.count === 0
                                                    ? 'transparent'
                                                    : full
                                                      ? color.due
                                                      : color.accent,
                                        },
                                    ]}
                                />
                            </View>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.legend}>
                <Legend tone={color.accent} label="booked load" />
                <Legend tone={color.due} label="fully booked" />
                {branchName ? (
                    <Text variant="caption" tone="muted" style={styles.legendBranch}>
                        {branchName}
                    </Text>
                ) : null}
            </View>

            <View style={styles.summary}>
                <Text variant="subhead" weight="semibold">
                    {formatDate(pending)}
                </Text>
                {query.status === 'loading' ? (
                    <Text variant="footnote" tone="muted">
                        Counting the month…
                    </Text>
                ) : query.status === 'error' && query.error ? (
                    <View style={styles.summaryError}>
                        <Text variant="footnote" tone="due">
                            {describeError(query.error, 'day').title}
                        </Text>
                        <Button label="Try again" variant="text" size="md" onPress={query.refetch} />
                    </View>
                ) : (
                    <Text variant="footnote" tone="muted">
                        {pendingClosed
                            ? 'Closed that day.'
                            : pendingLoad && pendingLoad.count > 0
                              ? `${pendingLoad.count} booked · ${Math.round(pendingLoad.fill * 100)}% of the day${
                                    pendingLoad.firstAt ? ` · first ${firstLabel(pendingLoad.firstAt)}` : ''
                                }`
                              : 'Nothing booked yet.'}
                    </Text>
                )}
            </View>
        </Sheet>
    );
}

function firstLabel(iso: string): string {
    const { time, meridiem } = time12(iso);
    return `${time} ${meridiem}`;
}

function Legend({ tone, label }: { tone: string; label: string }) {
    return (
        <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: tone }]} />
            <Text variant="caption" tone="muted">
                {label}
            </Text>
        </View>
    );
}

const CELL = size.row;

const styles = StyleSheet.create({
    monthBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: space[3],
    },
    monthNav: { flexDirection: 'row', gap: space[1.5] },
    weekdays: { flexDirection: 'row' },
    weekday: { width: `${100 / 7}%`, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space[1] },
    cell: { width: `${100 / 7}%`, height: CELL + space[2], padding: space[0.5] },
    cellBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1],
        borderRadius: radius.md,
        paddingHorizontal: space[1],
    },
    closed: {
        backgroundColor: color.canvas,
        borderWidth: border.hair,
        borderStyle: 'dashed',
        borderColor: color.line,
    },
    full: { backgroundColor: color.dueSoft },
    today: { borderWidth: border.thick, borderColor: color.ink },
    // The border width matches `today`'s: Android squares off the background of
    // a rounded box that carries a border colour without one.
    picked: { backgroundColor: color.ink, borderWidth: border.thick, borderColor: color.ink },
    load: { height: 3, borderRadius: radius.full },
    legend: { flexDirection: 'row', gap: space[4], marginTop: space[4] },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    legendSwatch: { width: space[4], height: 3, borderRadius: radius.full },
    legendBranch: { marginStart: 'auto' },
    summary: {
        marginTop: space[3.5],
        gap: space[1],
        padding: space[3.5],
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        borderWidth: border.hair,
        borderColor: color.line,
        boxShadow: shadow.card,
    },
    summaryError: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
