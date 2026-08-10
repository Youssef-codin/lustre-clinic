import { ScrollView, StyleSheet, View } from 'react-native';
import { Callout, SectionLabel } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { weekdayName, weekdayOf } from '../time';
import { AppointmentRow } from './AppointmentRow';

/**
 * A closed day is closed, not empty.
 *
 * An empty timeline says "nothing booked yet" and invites the secretary to book
 * into it. A Friday says "we are shut". They are different facts and the screen
 * has to tell them apart, or someone gets booked into a locked clinic.
 *
 * Anything already on a closed day is still shown. Booking outside opening
 * hours is the secretary's call and the server allows it (§7) — an appointment
 * that exists must never be invisible, and a day that was open when it was
 * booked can be closed afterwards.
 */

export type ClosedDayProps = {
    dateKey: string;
    appointments: readonly Appointment[];
    onSelect: (appointment: Appointment) => void;
};

export function ClosedDay({ dateKey, appointments, onSelect }: ClosedDayProps) {
    return (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.panel}>
                <Text variant="title3" weight="semibold">
                    Closed
                </Text>
                <Text variant="body" tone="muted" style={styles.body}>
                    The clinic does not open on {weekdayName(weekdayOf(dateKey))}s. Change that in Settings →
                    Opening hours.
                </Text>
            </View>

            {appointments.length > 0 ? (
                <View style={styles.booked}>
                    <SectionLabel count={appointments.length}>BOOKED ANYWAY</SectionLabel>
                    <Callout tone="warning">
                        These are on a day the clinic is closed. They were either booked before the hours
                        changed, or booked deliberately.
                    </Callout>
                    <View style={styles.rows}>
                        {appointments.map((appointment) => (
                            <AppointmentRow
                                key={appointment.id}
                                appointment={appointment}
                                onPress={() => onSelect(appointment)}
                            />
                        ))}
                    </View>
                </View>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { padding: size.gutter, gap: space[6] },
    panel: {
        alignItems: 'center',
        gap: space[2],
        padding: space[7],
        backgroundColor: color.canvas,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.line,
        borderStyle: 'dashed',
    },
    body: { textAlign: 'center' },
    booked: { gap: space[3] },
    rows: { gap: space[2] },
});
