import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron, Dot } from '../../../components/ui';
import { color, size, space, Text } from '../../../theme';
import type { Patient } from '../data/types';
import { _LocalMoneyValue } from './_LocalMoneyValue';

/**
 * `_Local` per §10: `domain/PatientRow` is listed as pre-built and shared, and
 * `domain/` does not exist yet. Noted in `BLOCKED.md`.
 *
 * Component Inventory §5: name, then phone · age · sex in mono, an outstanding
 * amount in `due` with a dot when there is one, and a chevron.
 *
 * The name sets no face. Arabic and Latin names sit in the same list and
 * `<Text>` detects the script per string (§6), so this row works for both
 * without knowing which it has. The meta line is mono because it is digits.
 */

export type _LocalPatientRowProps = {
    patient: Patient;
    /** Integer piastres owed across all visits, or 0. */
    due?: number;
    onPress: () => void;
};

export function _LocalPatientRow({ patient, due = 0, onPress }: _LocalPatientRowProps) {
    const meta = [patient.phone, patient.age === null ? null : `${patient.age}`, patient.gender]
        .filter((part): part is string => Boolean(part))
        .join('  ·  ');

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={patient.name}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={`patient-row-${patient.id}`}
        >
            <View style={styles.text}>
                <Text variant="headline" numberOfLines={1}>
                    {patient.name}
                </Text>
                <Text variant="subhead" tone="muted" script="mono" numberOfLines={1}>
                    {meta}
                </Text>
            </View>

            {due > 0 && (
                <View style={styles.due}>
                    <Dot tone="due" size={6} />
                    <_LocalMoneyValue amount={due} tone="due" variant="callout" />
                </View>
            )}

            <Chevron />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[4],
        paddingHorizontal: size.gutter,
        paddingVertical: space[2.5],
        backgroundColor: color.surface,
    },
    text: { flex: 1, gap: space[0.5] },
    due: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    pressed: { backgroundColor: color.surface2 },
});
