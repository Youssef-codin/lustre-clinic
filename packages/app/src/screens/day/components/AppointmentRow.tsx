import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron, Tag } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { formatTime } from '../time';
import { _LocalStatusPill } from './_LocalStatusPill';

/**
 * The list form of an appointment — for the places a timeline makes no sense:
 * a closed day, and the calendar's day summary.
 *
 * §5 lists `domain/AppointmentRow` under the day views only, so it stays in the
 * cluster rather than being a `_Local` awaiting promotion.
 */

export type AppointmentRowProps = {
    appointment: Appointment;
    onPress: () => void;
};

export function AppointmentRow({ appointment, onPress }: AppointmentRowProps) {
    const past = appointment.status === 'done' || appointment.status === 'cancelled';

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatTime(appointment.startsAt)}, ${appointment.patient.name}`}
            onPress={onPress}
            style={({ pressed }) => [styles.row, past && styles.past, pressed && styles.pressed]}
        >
            <Text variant="amount" weight="medium" style={styles.time}>
                {formatTime(appointment.startsAt)}
            </Text>

            <View style={styles.body}>
                <Text variant="headline" weight="semibold" numberOfLines={1}>
                    {appointment.patient.name}
                </Text>
                <View style={styles.meta}>
                    <Text variant="subhead" tone="muted">
                        {appointment.durationMinutes} min
                    </Text>
                    {appointment.channel === 'walk_in' ? <Tag tone="muted">WALK-IN</Tag> : null}
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
