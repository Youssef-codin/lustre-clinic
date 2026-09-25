/**
 * The list form of an appointment — for the places a timeline makes no sense
 * (a closed day, the calendar's day summary). §5 lists `domain/AppointmentRow`
 * under the day views only, so it stays in the cluster rather than moving to
 * `domain/`.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { StatusPill, TimeValue } from '../../../components/domain';
import { Chevron } from '../../../components/ui';
import { useT } from '../../../i18n';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { formatClock12, minutesOfDay } from '../time';
import { LabTag } from './LabWork';

export type AppointmentRowProps = {
    appointment: Appointment;
    onPress: () => void;
    /**
     * Minutes-from-midnight the row is realistically going to start, when the
     * day is running behind. Drawn *beside* the booked time, never instead of
     * it — the booked time is what the patient was told on the phone.
     */
    projectedMinutes?: number | null;
    /** Whether this `checked_in` patient heads the arrival queue; everyone behind them reads Waiting. */
    inChair?: boolean;
};

export function AppointmentRow({
    appointment,
    onPress,
    projectedMinutes = null,
    inChair = false,
}: AppointmentRowProps) {
    const t = useT();
    const past = appointment.status === 'done' || appointment.status === 'cancelled';
    const booked = minutesOfDay(appointment.startsAt);
    const slipped = projectedMinutes !== null && projectedMinutes > booked;
    // The day has moved; the row shows where it moved to, not where it started —
    // on the same clock the booked time uses, so the column keeps one shape
    // whether or not the day is late.
    const shownMinutes = slipped ? projectedMinutes : booked;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={[
                formatClock12(booked),
                appointment.patient.name,
                ...(appointment.labStatus === 'pending' ? [t('Lab not back yet')] : []),
            ].join(', ')}
            onPress={onPress}
            style={({ pressed }) => [styles.row, past && styles.past, pressed && styles.pressed]}
        >
            <View style={styles.time}>
                <TimeValue minutes={shownMinutes} weight="medium" tone={slipped ? 'due' : 'ink'} />
            </View>

            <View style={styles.body}>
                <Text variant="headline" weight="semibold" numberOfLines={1}>
                    {appointment.patient.name}
                </Text>
                <View style={styles.meta}>
                    <Text variant="subhead" tone="muted">
                        {t('{minutes} min', { minutes: appointment.durationMinutes })}
                    </Text>
                    <StatusPill status={appointment.status} inChair={inChair} />
                    <LabTag status={appointment.labStatus} />
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
    // Wider than the 24-hour column it replaces: the meridiem rides beside the
    // figure, and every row has one. It must never wrap — 56px fitted "12:0"
    // and broke the last digit onto its own line, so the column jumped between
    // one shape and the other down the list. `TimeValue` lays the figure and
    // meridiem out itself; this only reserves the width.
    time: { width: 80, flexShrink: 0 },
    body: { flex: 1, gap: space[1] },
    meta: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
});
