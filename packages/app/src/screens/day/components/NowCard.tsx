import { StyleSheet, View } from 'react-native';
import { Button, Dot } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { formatTime, minutesOfDay } from '../time';

/**
 * The chair, at the top of the screen.
 *
 * The timeline answers "what does today look like"; this answers "what is
 * happening right now", which is the question the secretary actually has all
 * day. It is the black card from the designs, and it has four states because
 * the clinic has four: someone in the chair, someone at the desk paying,
 * someone due next, and nobody.
 */

export type NowCardProps = {
    /** The patient in the chair, or at the desk. */
    active: Appointment | null;
    /** The next appointment still to arrive, if any. */
    next: Appointment | null;
    nowMinutes: number;
    /** Null while the id of the visit behind `active` is not known. */
    onCheckIn: (appointment: Appointment) => void;
    onOpen: (appointment: Appointment) => void;
    checkingInId: string | null;
};

function waitedFor(appointment: Appointment, nowMinutes: number): string {
    const elapsed = Math.max(nowMinutes - minutesOfDay(appointment.startsAt), 0);
    if (elapsed < 60) return `${elapsed} min`;
    return `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
}

export function NowCard({ active, next, nowMinutes, onCheckIn, onOpen, checkingInId }: NowCardProps) {
    if (active) {
        const inChair = active.status === 'checked_in';

        return (
            <View style={styles.card}>
                <View style={styles.eyebrowRow}>
                    <Dot tone={inChair ? 'live' : 'due'} pulse={inChair} />
                    <Text variant="eyebrow" tone="inverse">
                        {inChair ? 'IN THE CHAIR' : 'AT THE DESK'}
                    </Text>
                </View>

                <Text variant="title3" weight="semibold" tone="inverse" numberOfLines={1}>
                    {active.patient.name}
                </Text>
                <Text variant="subhead" tone="muted">
                    {inChair
                        ? `Since ${formatTime(active.startsAt)} · ${waitedFor(active, nowMinutes)}`
                        : 'Waiting to settle up'}
                </Text>

                <View style={styles.actions}>
                    <Button label="Open" variant="accent" size="md" onPress={() => onOpen(active)} block />
                </View>
            </View>
        );
    }

    if (next) {
        const until = minutesOfDay(next.startsAt) - nowMinutes;

        return (
            <View style={styles.card}>
                <View style={styles.eyebrowRow}>
                    <Dot tone="accent" />
                    <Text variant="eyebrow" tone="inverse">
                        NEXT UP
                    </Text>
                </View>

                <Text variant="title3" weight="semibold" tone="inverse" numberOfLines={1}>
                    {next.patient.name}
                </Text>
                <Text variant="subhead" tone="muted">
                    {until > 0
                        ? `${formatTime(next.startsAt)} · in ${until} min`
                        : `${formatTime(next.startsAt)} · ${Math.abs(until)} min late`}
                </Text>

                <View style={styles.actions}>
                    <Button
                        label="Check in"
                        variant="accent"
                        size="md"
                        block
                        loading={checkingInId === next.id}
                        onPress={() => onCheckIn(next)}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.card, styles.empty]}>
            <Text variant="eyebrow" tone="muted">
                THE CHAIR
            </Text>
            <Text variant="headline" weight="medium" tone="inverse">
                Nobody in the chair
            </Text>
            <Text variant="subhead" tone="muted">
                Nothing left to check in today.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: size.gutter,
        marginTop: space[3],
        padding: space[4],
        gap: space[1],
        backgroundColor: color.ink,
        borderRadius: radius.xl2,
    },
    empty: { gap: space[0.5] },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[1] },
    actions: { marginTop: space[3] },
});
