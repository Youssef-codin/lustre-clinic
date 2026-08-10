import { Pressable, StyleSheet, View } from 'react-native';
import type { RouterOutput } from '../../api';
import { color, size, space, Text } from '../../theme';
import { Chevron, Dot } from '../ui';
import { MoneyValue } from './MoneyValue';

/**
 * One patient in a list (Component Inventory §5) — the patients list, search
 * results, and the debtors list on the money screen.
 *
 * The shape is the server's: `patient.search` returns it, and `Partial` on the
 * derived fields is what lets a balance row, which only knows a name and a
 * phone, use the same component.
 */

type SearchedPatient = RouterOutput['patient']['search'][number];

export type PatientSummary = Pick<SearchedPatient, 'name' | 'phone'> &
    Partial<Pick<SearchedPatient, 'age' | 'gender'>>;

export type PatientRowProps = {
    patient: PatientSummary;
    /**
     * Outstanding balance in piastres, when the caller knows it. Shown in `due`
     * with a dot — never as a failure state: partial payment is normal here.
     */
    balance?: number;
    onPress?: () => void;
    testID?: string;
};

export function PatientRow({ patient, balance, onPress, testID }: PatientRowProps) {
    const { name, phone, age, gender } = patient;
    const owes = balance !== undefined && balance > 0;

    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole={onPress ? 'button' : undefined}
            testID={testID}
        >
            <View style={styles.identity}>
                <Text variant="headline" numberOfLines={1}>
                    {name}
                </Text>
                <View style={styles.meta}>
                    {/* Phone and age are numerals: mono, so rows align down the
                        list, and Latin in both languages (§7.11). */}
                    <Text variant="subhead" tone="muted" script="mono">
                        {age === null || age === undefined ? phone : `${phone} · ${age}`}
                    </Text>
                    {gender ? (
                        <Text variant="subhead" tone="muted" numberOfLines={1}>
                            {`· ${gender}`}
                        </Text>
                    ) : null}
                </View>
            </View>

            {owes ? (
                <View style={styles.balance}>
                    <Dot tone="due" size={5} />
                    <MoneyValue piastres={balance} variant="callout" tone="due" />
                </View>
            ) : null}

            <Chevron direction="forward" />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row,
        paddingVertical: space[2.5],
        paddingHorizontal: space[4],
        backgroundColor: color.surface,
    },
    pressed: { backgroundColor: color.surface2 },
    // Takes the slack so the balance and the chevron stay pinned to the end.
    identity: { flex: 1, gap: space[0.5] },
    meta: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    balance: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
