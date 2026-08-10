import { SLOT_HOLDING_STATUSES } from '@mawid/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chevron, IconButton, ProgressBar, Sheet } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { type Appointment, api, type ClinicDay, useLocalQuery } from '../data';
import { describeError } from '../errors';
import { isClosed, openMinutes } from '../hours';
import { addMonths, formatMonth, localOffsetMinutes, monthDays, parseKey, todayKey } from '../time';

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
    onPick: (dateKey: string) => void;
    onClose: () => void;
};

interface DayLoad {
    count: number;
    /** 0–1 of the clinic's open minutes. Over 0.9 reads as full. */
    fill: number;
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
        loads.set(day, { count: holding.length, fill: open > 0 ? Math.min(booked / open, 1) : 0 });
    });

    return loads;
}

export function CalendarSheet({ visible, selected, schedule, onPick, onClose }: CalendarSheetProps) {
    const [month, setMonth] = useState(selected);
    const [pending, setPending] = useState(selected);

    const days = monthDays(month);
    const query = useLocalQuery(`month:${month}`, () => api.byDates(days, localOffsetMinutes()), {
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
            title="Pick a day"
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
                <IconButton
                    accessibilityLabel="Previous month"
                    icon={<Chevron direction="back" tone="ink" size={9} />}
                    variant="square"
                    onPress={() => goToMonth(addMonths(month, -1))}
                />
                <Text variant="headline" weight="semibold">
                    {formatMonth(month)}
                </Text>
                <IconButton
                    accessibilityLabel="Next month"
                    icon={<Chevron direction="forward" tone="ink" size={9} />}
                    variant="square"
                    onPress={() => goToMonth(addMonths(month, 1))}
                />
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

                                {/* The bar is the load, not a decoration: an empty
                                    track is a free day, a full one is a full day. */}
                                <View style={styles.loadTrack}>
                                    {load && !closed ? (
                                        <ProgressBar
                                            value={load.fill}
                                            tone={full ? 'due' : 'accent'}
                                            height={3}
                                            onDark={day === pending}
                                        />
                                    ) : null}
                                </View>
                            </View>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.legend}>
                <Legend tone={color.accent} label="Booked" />
                <Legend tone={color.due} label="Full" />
                <Legend tone={color.line} label="Closed" />
            </View>

            <View style={styles.summary}>
                {query.status === 'loading' ? (
                    <Text variant="subhead" tone="muted">
                        Counting the month…
                    </Text>
                ) : query.status === 'error' && query.error ? (
                    <View style={styles.summaryError}>
                        <Text variant="subhead" tone="due">
                            {describeError(query.error, 'day').title}
                        </Text>
                        <Button label="Try again" variant="text" size="md" onPress={query.refetch} />
                    </View>
                ) : (
                    <Text variant="subhead" tone="muted">
                        {pendingClosed
                            ? 'Closed that day.'
                            : pendingLoad && pendingLoad.count > 0
                              ? `${pendingLoad.count} booked · ${Math.round(pendingLoad.fill * 100)}% of the day`
                              : 'Nothing booked yet.'}
                    </Text>
                )}
            </View>
        </Sheet>
    );
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
    picked: { backgroundColor: color.ink, borderColor: color.ink },
    loadTrack: { alignSelf: 'stretch', height: 3 },
    legend: { flexDirection: 'row', gap: space[4], marginTop: space[4] },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    legendSwatch: { width: space[2], height: space[2], borderRadius: radius.full },
    summary: { marginTop: space[3], minHeight: size.row, justifyContent: 'center' },
    summaryError: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
