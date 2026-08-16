/**
 * A closed day is closed, not empty — an empty day invites a booking, a Friday
 * means shut, and the two must be told apart or someone gets booked into a
 * locked clinic. Anything already on a closed day is still shown: booking
 * outside opening hours is the secretary's call and the server allows it, and
 * a day that was open when it was booked can be closed afterwards.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { Callout, type RefreshControlElement, SectionLabel } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { weekdayName, weekdayOf } from '../time';
import { AppointmentRow } from './AppointmentRow';

export type ClosedDayProps = {
    dateKey: string;
    appointments: readonly Appointment[];
    onSelect: (appointment: Appointment) => void;
    /** The day screen's pull-to-refresh, so a closed day is pullable too. */
    refreshControl?: RefreshControlElement;
};

export function ClosedDay({ dateKey, appointments, onSelect, refreshControl }: ClosedDayProps) {
    return (
        <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
        >
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
