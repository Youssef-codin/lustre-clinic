/**
 * Where an appointment is, as a pill (Component Inventory §5 — `StatusChip`).
 * The six statuses are the server's (§7); this owns nothing but how each one
 * looks and reads. `checked_in` pulses a live dot so the day view reads it from
 * across a desk; `awaiting_payment` says where the patient is, not what they
 * owe; `no_show` is `due` because that tone carries late as well as owed. The
 * label is English until the localization scaffold lands (F4); `label`
 * overrides it.
 */
import type { AppointmentStatus } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import type { TextTone } from '../../theme';
import { color, radius, space, Text } from '../../theme';
import { Dot, type DotTone } from '../ui';

export type StatusPillProps = {
    status: AppointmentStatus;
    label?: string;
    animated?: boolean;
    testID?: string;
};

interface Appearance {
    label: string;
    text: TextTone;
    fill: string;
    dot: DotTone | null;
    pulse: boolean;
}

const APPEARANCE: Record<AppointmentStatus, Appearance> = {
    booked: { label: 'Booked', text: 'muted', fill: color.surface2, dot: null, pulse: false },
    checked_in: { label: 'In progress', text: 'ink', fill: color.surface2, dot: 'wa', pulse: true },
    awaiting_payment: {
        label: 'At the desk',
        text: 'accent',
        fill: color.accentSoft,
        dot: 'accent',
        pulse: false,
    },
    done: { label: 'Completed', text: 'success', fill: color.successSoft, dot: null, pulse: false },
    cancelled: { label: 'Cancelled', text: 'muted', fill: color.surface2, dot: null, pulse: false },
    no_show: { label: 'Did not attend', text: 'due', fill: color.dueSoft, dot: 'due', pulse: false },
};

export function StatusPill({ status, label, animated = true, testID }: StatusPillProps) {
    const appearance = APPEARANCE[status];

    return (
        <View style={[styles.pill, { backgroundColor: appearance.fill }]} testID={testID}>
            {appearance.dot ? (
                <Dot tone={appearance.dot} size={5} pulse={appearance.pulse && animated} />
            ) : null}
            <Text variant="tag" tone={appearance.text}>
                {label ?? appearance.label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: space[1],
        paddingHorizontal: space[1.5],
        paddingVertical: space[0.5],
        borderRadius: radius.full,
    },
});
