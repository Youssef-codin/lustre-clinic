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
import { formatTime, minutesOfDay, minutesToClock } from '../time';
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
    // The day has moved; the row shows where it moved to, not where it started —
    // in the same 24-hour clock the booked time uses, so the column keeps one
    // shape whether or not the day is late.
    const shownTime = slipped ? minutesToClock(projectedMinutes) : formatTime(appointment.startsAt);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatTime(appointment.startsAt)}, ${appointment.patient.name}`}
            onPress={onPress}
            style={({ pressed }) => [styles.row, past && styles.past, pressed && styles.pressed]}
        >
            <Text variant="amount" weight="medium" tone={slipped ? 'due' : 'ink'} style={styles.time}>
                {shownTime}
            </Text>

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
    time: { width: 56 },
    body: { flex: 1, gap: space[1] },
    meta: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
});
