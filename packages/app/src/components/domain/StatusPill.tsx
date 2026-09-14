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
 * an accessibility string or a row that only has room for a word. They live in
 * `./status` so the choice can be tested without React Native.
 *
 * `inChair` is the queue's answer (`screens/day/chair.ts`). `checked_in` covers
 * the chair and the waiting room alike, so a pill that knows the queue says
 * Waiting for everyone behind the head, in the day view's colour for it.
 */
import type { AppointmentStatus } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import { space } from '../../theme';
import { Dot, Tag } from '../ui';
import { statusLabel, statusTone } from './status';

export type { StatusTone } from './status';
export { statusLabel, statusTone } from './status';

export type StatusPillProps = {
    status: AppointmentStatus;
    /** Whether this `checked_in` patient heads the queue. Left out, the pill cannot tell. */
    inChair?: boolean;
    label?: string;
    withDot?: boolean;
    /** Off for a long list, where a dot per row animates once per row. */
    animated?: boolean;
    testID?: string;
};

export function StatusPill({
    status,
    inChair,
    label,
    withDot = false,
    animated = true,
    testID,
}: StatusPillProps) {
    const tone = statusTone(status, inChair);
    const seated = status === 'checked_in' && inChair !== false;

    return (
        <View style={styles.row} testID={testID}>
            {withDot ? <Dot tone={tone} pulse={animated && status === 'checked_in'} /> : null}
            <Tag tone={tone} variant={seated ? 'filled' : 'outline'}>
                {label ?? statusLabel(status, inChair)}
            </Tag>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
