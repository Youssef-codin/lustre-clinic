import { Pressable, StyleSheet, View } from 'react-native';
import { Tag } from '../../../components/ui';
import { border, color, radius, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { formatTime } from '../time';
import { _LocalStatusPill } from './_LocalStatusPill';

/**
 * One appointment on the timeline.
 *
 * The block is sized by the clock, not by its content, so a 20-minute visit is
 * physically shorter than a 45-minute one — that proportion is the only reason
 * to draw a timeline instead of a list. Which means the content has to survive
 * being 32px tall, and `dense` is that: time and name, nothing else.
 */

export type AppointmentBlockProps = {
    appointment: Appointment;
    height: number;
    onPress: () => void;
};

/** Below this the block cannot hold a second line without clipping it. */
const DENSE_BELOW = 58;

const EDGE = {
    booked: color.accent,
    checked_in: color.accent,
    awaiting_payment: color.due,
    done: color.success,
    cancelled: color.line,
    no_show: color.due,
} as const;

export function AppointmentBlock({ appointment, height, onPress }: AppointmentBlockProps) {
    const dense = height < DENSE_BELOW;
    const past = appointment.status === 'done' || appointment.status === 'cancelled';
    const cancelled = appointment.status === 'cancelled';

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatTime(appointment.startsAt)}, ${appointment.patient.name}`}
            onPress={onPress}
            style={({ pressed }) => [
                styles.block,
                { borderStartColor: EDGE[appointment.status] },
                cancelled && styles.cancelled,
                past && styles.past,
                pressed && styles.pressed,
            ]}
        >
            <View style={styles.line}>
                <Text variant="caption" weight="medium" tone="muted">
                    {formatTime(appointment.startsAt)}
                </Text>
                <Text variant="caption" tone="muted">
                    {appointment.durationMinutes} min
                </Text>
                {appointment.channel === 'walk_in' ? <Tag tone="muted">WALK-IN</Tag> : null}
            </View>

            <Text variant={dense ? 'callout' : 'headline'} weight="semibold" numberOfLines={1}>
                {appointment.patient.name}
            </Text>

            {dense ? null : (
                <View style={styles.line}>
                    <_LocalStatusPill status={appointment.status} withDot />
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    block: {
        flex: 1,
        overflow: 'hidden',
        justifyContent: 'center',
        gap: space[0.5],
        paddingHorizontal: space[3],
        paddingVertical: space[1.5],
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: border.hair,
        borderColor: color.line,
        borderStartWidth: 3,
    },
    line: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    // Done and cancelled have happened. They stay legible and stop competing.
    past: { opacity: 0.72 },
    cancelled: { backgroundColor: color.canvas, borderStyle: 'dashed' },
    pressed: { backgroundColor: color.surface2 },
});
