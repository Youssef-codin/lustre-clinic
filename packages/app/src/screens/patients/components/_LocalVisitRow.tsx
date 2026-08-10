import { StyleSheet, View } from 'react-native';
import { Tag } from '../../../components/ui';
import { size, space, Text } from '../../../theme';
import type { PatientVisit } from '../data/types';
import { _LocalMoneyValue } from './_LocalMoneyValue';

/**
 * `_Local` per §10 — `domain/VisitRow` is a patient-record component and
 * `domain/` does not exist yet. Noted in `BLOCKED.md`.
 *
 * Component Inventory §5: a date stamp, what was charged, and the balance
 * underneath when there is one. The row is not tappable: the visit screens are
 * another cluster's, so there is nowhere to go yet — noted in `BLOCKED.md`
 * rather than wired to a dead handler.
 *
 * There is no status pill. `patient.byId` returns visits, not appointments, so
 * the payload carries no `status` — what a record can say about a visit is
 * whether it is settled, which is derived from the balance (§10).
 */

export type _LocalVisitRowProps = {
    visit: PatientVisit;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function stamp(iso: string): { day: string; month: string } {
    const date = new Date(iso);
    return {
        day: String(date.getDate()).padStart(2, '0'),
        month: MONTHS[date.getMonth()] ?? '',
    };
}

export function _LocalVisitRow({ visit }: _LocalVisitRowProps) {
    const { day, month } = stamp(visit.startsAt);
    const settled = visit.balance <= 0;

    return (
        <View style={styles.row} testID={`visit-row-${visit.visitId}`}>
            <View style={styles.stamp}>
                <Text variant="headline" script="mono">
                    {day}
                </Text>
                <Text variant="tag" tone="muted">
                    {month}
                </Text>
            </View>

            <View style={styles.body}>
                <Text variant="callout" script="mono" tone="ink2" numberOfLines={1}>
                    {visit.ref}
                </Text>
                <View style={styles.tag}>
                    <Tag tone={settled ? 'success' : 'due'} variant="filled">
                        {settled ? 'SETTLED' : 'OUTSTANDING'}
                    </Tag>
                </View>
            </View>

            <View style={styles.amounts}>
                <_LocalMoneyValue amount={visit.chargedTotal} variant="callout" />
                {!settled && <_LocalMoneyValue amount={visit.balance} tone="due" variant="footnote" />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[2.5],
    },
    stamp: { width: 34, alignItems: 'center' },
    body: { flex: 1, alignItems: 'flex-start', gap: space[1] },
    tag: { flexDirection: 'row' },
    amounts: { alignItems: 'flex-end', gap: space[0.5] },
});
