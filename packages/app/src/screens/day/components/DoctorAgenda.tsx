/**
 * "After this" — the rest of the doctor's day. The same rows the secretary
 * sees, with the check-in button taken off them: checking a patient in is the
 * desk's job, and what the doctor needs from a row is where the patient is —
 * a badge, the same one the patient's record draws. Today that is two states, because after the chair there
 * are only two: they are here, or they are not yet. Any other day the list is
 * the whole day, so each row says what became of it.
 */
import { StyleSheet, View } from 'react-native';
import { StatusBadge } from '../../../components/domain';
import { useT } from '../../../i18n';
import { size, space, Text } from '../../../theme';
import { rowSummary } from '../agenda';
import type { Appointment } from '../data';
import { AgendaRow } from './Agenda';
import { ArrowForwardIcon } from './icons';

export type AfterThisProps = {
    appointments: readonly Appointment[];
    relativeToNow: boolean;
    onSelect: (appointment: Appointment) => void;
};

export function AfterThis({ appointments, relativeToNow, onSelect }: AfterThisProps) {
    const t = useT();
    if (appointments.length === 0) return null;

    return (
        <View style={styles.section}>
            <View style={styles.label}>
                <ArrowForwardIcon size={13} />
                <Text variant="eyebrow" tone="muted">
                    {`${t(relativeToNow ? 'AFTER THIS' : 'THE DAY')} · ${appointments.length}`}
                </Text>
            </View>

            {appointments.map((appointment) => (
                <AgendaRow
                    key={appointment.id}
                    appointment={appointment}
                    procedure={rowSummary(appointment)}
                    onPress={() => onSelect(appointment)}
                    // Today the chair is drawn above, so every `checked_in` row here is behind it.
                    trailing={
                        <StatusBadge
                            status={appointment.status}
                            inChair={relativeToNow ? false : undefined}
                        />
                    }
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    section: { paddingHorizontal: size.gutter, marginTop: space[2] },
    label: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], minHeight: space[6] },
});
