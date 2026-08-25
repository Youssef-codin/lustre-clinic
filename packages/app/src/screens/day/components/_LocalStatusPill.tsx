/**
 * `_Local` — BLOCKED.md: §10 freezes `domain/StatusPill` as shared and
 * `components/domain/` does not exist yet; promote whole. The mapping is the
 * point — a status is one word and one colour, decided once, so a cancelled
 * appointment cannot read as a settled one. The chair's dot is accent rather
 * than `live`, which disappears on white; a pulsing accent dot reads as the
 * chair here.
 */
import type { AppointmentStatus } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import { Dot, Tag } from '../../../components/ui';
import { space } from '../../../theme';

export type StatusPillProps = {
    status: AppointmentStatus;
    withDot?: boolean;
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
} as const satisfies Record<AppointmentStatus, 'muted' | 'accent' | 'due' | 'success'>;

export function statusLabel(status: AppointmentStatus): string {
    return LABEL[status];
}

/** The pill's colour without the pill, for rows that only have room for a word. */
export function statusTone(status: AppointmentStatus): (typeof TONE)[AppointmentStatus] {
    return TONE[status];
}

export function _LocalStatusPill({ status, withDot = false }: StatusPillProps) {
    const tone = TONE[status];

    return (
        <View style={styles.row}>
            {withDot ? <Dot tone={tone} pulse={status === 'checked_in'} /> : null}
            <Tag tone={tone} variant={status === 'checked_in' ? 'filled' : 'outline'}>
                {LABEL[status]}
            </Tag>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
