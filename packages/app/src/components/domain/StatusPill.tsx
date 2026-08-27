/**
 * Where an appointment is, as a pill (Component Inventory §5 — `StatusChip`).
 * The six statuses are the server's (§7); this owns nothing but how each one
 * looks and reads.
 *
 * The mapping is the point — a status is one word and one colour, decided once,
 * so a cancelled appointment cannot read as a settled one. The wording is the
 * mockups': "In the chair", "No-show", "At the desk". `awaiting_payment` says
 * where the patient is, not what they owe; balance is derived and shown
 * separately (§10). Labels are English until the localization scaffold lands
 * (F4), and `label` is the override that scaffold will use.
 *
 * `withDot` is opt-in because a dot is for a pill being read on its own — a
 * sheet headline, a visit head. In a list every row would carry one and the
 * column stops meaning anything. `checked_in` pulses when it has a dot: it is
 * the in-the-chair state the day view reads from across a desk. The chair's dot
 * is accent rather than `live`, which disappears on white.
 *
 * `statusLabel` and `statusTone` are the same mapping without the markup, for
 * an accessibility string or a row that only has room for a word.
 */
import type { AppointmentStatus } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import { space } from '../../theme';
import { Dot, Tag } from '../ui';

export type StatusTone = 'muted' | 'accent' | 'due' | 'success';

export type StatusPillProps = {
    status: AppointmentStatus;
    label?: string;
    withDot?: boolean;
    /** Off for a long list, where a dot per row animates once per row. */
    animated?: boolean;
    testID?: string;
};

const LABEL: Record<AppointmentStatus, string> = {
    booked: 'Booked',
    checked_in: 'In the chair',
    awaiting_payment: 'At the desk',
    done: 'Done',
    cancelled: 'Cancelled',
    no_show: 'No-show',
};

const TONE = {
    booked: 'muted',
    checked_in: 'accent',
    awaiting_payment: 'due',
    done: 'success',
    cancelled: 'muted',
    no_show: 'due',
} as const satisfies Record<AppointmentStatus, StatusTone>;

export function statusLabel(status: AppointmentStatus): string {
    return LABEL[status];
}

/** The pill's colour without the pill, for rows that only have room for a word. */
export function statusTone(status: AppointmentStatus): StatusTone {
    return TONE[status];
}

export function StatusPill({ status, label, withDot = false, animated = true, testID }: StatusPillProps) {
    const tone = TONE[status];

    return (
        <View style={styles.row} testID={testID}>
            {withDot ? <Dot tone={tone} pulse={animated && status === 'checked_in'} /> : null}
            <Tag tone={tone} variant={status === 'checked_in' ? 'filled' : 'outline'}>
                {label ?? LABEL[status]}
            </Tag>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
