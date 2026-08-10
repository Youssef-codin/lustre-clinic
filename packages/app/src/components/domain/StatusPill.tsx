import type { AppointmentStatus } from '@mawid/shared';
import { StyleSheet, View } from 'react-native';
import type { TextTone } from '../../theme';
import { color, radius, space, Text } from '../../theme';
import { Dot, type DotTone } from '../ui';

/**
 * Where an appointment is, as a pill (Component Inventory §5 — `StatusChip`).
 * The six statuses are the server's (§7); this component owns nothing but how
 * each one looks and reads.
 *
 *     <StatusPill status="checked_in" />   // • In progress, pulsing
 *     <StatusPill status="no_show" />      // Did not attend
 *
 * The label is English until the localization scaffold lands (F4). `label`
 * overrides it, which is the seam that scaffold will use.
 */

export type StatusPillProps = {
    status: AppointmentStatus;
    /** Overrides the built-in English wording. */
    label?: string;
    /** Suppress the pulse on `checked_in`, e.g. in a long list. */
    animated?: boolean;
    testID?: string;
};

interface Appearance {
    label: string;
    text: TextTone;
    fill: string;
    dot: DotTone | null;
    /** The in-the-chair pulse (§3.4). */
    pulse: boolean;
}

const APPEARANCE: Record<AppointmentStatus, Appearance> = {
    booked: { label: 'Booked', text: 'muted', fill: color.surface2, dot: null, pulse: false },
    // The patient is in the chair. A live dot, pulsing, is what the day view
    // reads at a glance from across a desk.
    checked_in: { label: 'In progress', text: 'ink', fill: color.surface2, dot: 'wa', pulse: true },
    // Not an unpaid status — it says where the patient is, not what they owe (§7).
    awaiting_payment: {
        label: 'At the desk',
        text: 'accent',
        fill: color.accentSoft,
        dot: 'accent',
        pulse: false,
    },
    done: { label: 'Completed', text: 'success', fill: color.successSoft, dot: null, pulse: false },
    cancelled: { label: 'Cancelled', text: 'muted', fill: color.surface2, dot: null, pulse: false },
    // `due` carries late as well as owed — a patient who never arrived is late
    // by definition, and it is the colour the missed list is built in.
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
