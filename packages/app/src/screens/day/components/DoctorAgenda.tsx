/**
 * "After this" — the rest of the doctor's day. The same rows the secretary
 * sees, with the check-in button taken off them: checking a patient in is the
 * desk's job, and what the doctor needs from a row is where the patient is —
 * a word and a dot. Two states, because after the chair there are only two:
 * they are here, or they are not yet.
 */
import { StyleSheet, View } from 'react-native';
import { Dot } from '../../../components/ui';
import { size, space, Text } from '../../../theme';
import { procedureLabel } from '../agenda';
import type { Appointment } from '../data';
import { AgendaRow } from './Agenda';
import { ArrowForwardIcon } from './icons';

export type AfterThisProps = {
    appointments: readonly Appointment[];
    relativeToNow: boolean;
    onSelect: (appointment: Appointment) => void;
};

export function AfterThis({ appointments, relativeToNow, onSelect }: AfterThisProps) {
    if (appointments.length === 0) return null;

    return (
        <View style={styles.section}>
            <View style={styles.label}>
                <ArrowForwardIcon size={13} />
                <Text variant="eyebrow" tone="muted">
                    {`${relativeToNow ? 'AFTER THIS' : 'THE DAY'} · ${appointments.length}`}
                </Text>
            </View>

            {appointments.map((appointment) => (
                <AgendaRow
                    key={appointment.id}
                    appointment={appointment}
                    procedure={procedureLabel(appointment)}
                    onPress={() => onSelect(appointment)}
                    trailing={<Where appointment={appointment} />}
                />
            ))}
        </View>
    );
}

function Where({ appointment }: { appointment: Appointment }) {
    const here = appointment.status === 'checked_in';

    return (
        <View style={styles.where}>
            <Dot tone={here ? 'due' : 'muted'} size={8} />
            <Text variant="footnote" weight="semibold" tone={here ? 'due' : 'muted'}>
                {here ? 'Waiting' : 'Booked'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { paddingHorizontal: size.gutter, marginTop: space[2] },
    label: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], minHeight: space[6] },
    where: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
