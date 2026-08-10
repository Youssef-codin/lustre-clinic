import { ScrollView, StyleSheet, View } from 'react-native';
import { border, color, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import type { DayHours } from '../hours';
import { assignLanes } from '../layout';
import { minutesOfDay, minutesToClock } from '../time';
import { AppointmentBlock } from './AppointmentBlock';

/**
 * The day, drawn against a clock.
 *
 * A minute is a fixed number of pixels, so the gap between two o'clock and half
 * past is the same distance everywhere on the screen and a 45-minute visit
 * looks like more work than a 20-minute one. A list would be easier and would
 * lose exactly that.
 */

/** 30 minutes comes to 48px — clear of the 44px minimum row (§7.1). */
const PX_PER_MINUTE = 1.6;

/** The clock column. Wide enough for `10:00` in DM Mono at caption size. */
const RULER_WIDTH = 52;

/** Half the ruler row's height, so a line lands *on* its minute, not under it. */
const RULE_HALF = 8;

export type TimelineProps = {
    appointments: readonly Appointment[];
    bounds: DayHours;
    /** Minutes since midnight, or null when the day on screen is not today. */
    nowMinutes: number | null;
    onSelect: (appointment: Appointment) => void;
};

function y(minutes: number, bounds: DayHours): number {
    return (minutes - bounds.opens) * PX_PER_MINUTE;
}

export function Timeline({ appointments, bounds, nowMinutes, onSelect }: TimelineProps) {
    const height = Math.max((bounds.closes - bounds.opens) * PX_PER_MINUTE, 0);

    const slots = appointments.map((appointment) => {
        const startMinutes = minutesOfDay(appointment.startsAt);
        return { startMinutes, endMinutes: startMinutes + appointment.durationMinutes, appointment };
    });
    const placements = assignLanes(slots);

    const hours: number[] = [];
    for (let minute = bounds.opens; minute <= bounds.closes; minute += 60) hours.push(minute);

    return (
        <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            testID="day-timeline"
        >
            <View style={[styles.canvas, { height }]}>
                {hours.map((minute) => (
                    <View key={minute} style={[styles.hour, { top: y(minute, bounds) - RULE_HALF }]}>
                        <Text variant="caption" tone="muted" style={styles.rulerCell}>
                            {minutesToClock(minute)}
                        </Text>
                        <View style={styles.hourRule} />
                    </View>
                ))}

                <View style={styles.lanes}>
                    {slots.map(({ appointment, startMinutes, endMinutes }, index) => {
                        const placement = placements[index] ?? { lane: 0, lanes: 1 };
                        const blockHeight = Math.max((endMinutes - startMinutes) * PX_PER_MINUTE, size.row);

                        return (
                            <View
                                key={appointment.id}
                                style={[
                                    styles.slot,
                                    {
                                        top: y(startMinutes, bounds),
                                        height: blockHeight,
                                        start: `${(placement.lane / placement.lanes) * 100}%`,
                                        width: `${100 / placement.lanes}%`,
                                    },
                                ]}
                            >
                                <AppointmentBlock
                                    appointment={appointment}
                                    height={blockHeight}
                                    onPress={() => onSelect(appointment)}
                                />
                            </View>
                        );
                    })}
                </View>

                {/* Where the clinic is right now. Drawn last so it sits over the
                    block it crosses — the patient it is inside is the point. */}
                {nowMinutes !== null && nowMinutes >= bounds.opens && nowMinutes <= bounds.closes ? (
                    <View
                        style={[styles.hour, { top: y(nowMinutes, bounds) - RULE_HALF }]}
                        pointerEvents="none"
                    >
                        <Text variant="caption" weight="medium" tone="due" style={styles.rulerCell}>
                            {minutesToClock(nowMinutes)}
                        </Text>
                        <View style={styles.nowDot} />
                        <View style={styles.nowRule} />
                    </View>
                ) : null}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: size.gutter, paddingTop: space[3], paddingBottom: size.nav + space[6] },
    canvas: { position: 'relative' },
    hour: {
        position: 'absolute',
        start: 0,
        end: 0,
        height: RULE_HALF * 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
    },
    rulerCell: { width: RULER_WIDTH - space[2] },
    hourRule: { flex: 1, height: border.hair, backgroundColor: color.hair },
    lanes: { position: 'absolute', top: 0, bottom: 0, start: RULER_WIDTH, end: 0 },
    slot: { position: 'absolute', paddingEnd: space[1], paddingVertical: space[0.5] },
    nowDot: { width: space[2], height: space[2], borderRadius: space[1], backgroundColor: color.due },
    nowRule: { flex: 1, height: border.hair, backgroundColor: color.due },
});
