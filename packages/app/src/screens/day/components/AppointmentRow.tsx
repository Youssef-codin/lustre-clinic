/**
 * The list form of an appointment — for the places a timeline makes no sense
 * (a closed day, the calendar's day summary). §5 lists `domain/AppointmentRow`
 * under the day views only, so it stays in the cluster rather than being a
 * `_Local` awaiting promotion.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { clock12, minutesOfDay, time12 } from '../time';
import { _LocalStatusPill } from './_LocalStatusPill';

export type AppointmentRowProps = {
    appointment: Appointment;
    onPress: () => void;
    /**
     * Minutes-from-midnight the row is realistically going to start, when the
     * day is running behind. Drawn *beside* the booked time, never instead of
     * it — the booked time is what the patient was told on the phone.
     */
    projectedMinutes?: number | null;
};

export function AppointmentRow({ appointment, onPress, projectedMinutes = null }: AppointmentRowProps) {
    const past = appointment.status === 'done' || appointment.status === 'cancelled';
    const booked = minutesOfDay(appointment.startsAt);
    const slipped = projectedMinutes !== null && projectedMinutes > booked;
    const { time, meridiem } = time12(appointment.startsAt);
    // The day has moved; the row shows where it moved to, not where it started —
    // on the same 12-hour clock as the booked time, so a late day does not put
    // two clocks in one column.
    const shown = slipped ? clock12(projectedMinutes) : { time, meridiem };

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${time} ${meridiem}, ${appointment.patient.name}`}
            onPress={onPress}
            style={({ pressed }) => [styles.row, past && styles.past, pressed && styles.pressed]}
        >
            <View style={styles.clock}>
                <Text variant="amount" weight="medium" tone={slipped ? 'due' : 'ink'} numberOfLines={1}>
                    {shown.time}
                </Text>
                <Text variant="tag" tone={slipped ? 'due' : 'muted'}>
                    {shown.meridiem}
                </Text>
            </View>

            <View style={styles.body}>
                <Text variant="headline" weight="semibold" numberOfLines={1}>
                    {appointment.patient.name}
                </Text>
                <View style={styles.meta}>
                    <Text variant="subhead" tone="muted">
                        {appointment.durationMinutes} min
                    </Text>
                    <_LocalStatusPill status={appointment.status} />
                </View>
            </View>

            <Chevron />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row,
        padding: space[3],
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        borderWidth: border.hair,
        borderColor: color.line,
    },
    past: { opacity: 0.72 },
    pressed: { backgroundColor: color.surface2 },
    // Never wraps: 56px fitted "12:0" and broke the last digit onto its own
    // line, so the column jumped between one shape and the other down the list.
    clock: {
        width: 74,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: space[0.5],
    },
    body: { flex: 1, gap: space[1] },
    meta: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
});
