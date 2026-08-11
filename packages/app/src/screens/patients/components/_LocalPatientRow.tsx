// `_Local` per §10: `domain/PatientRow` is listed as shared but `domain/` does
// not exist yet. Name, then phone · age · sex in mono, an outstanding amount in
// `due` with a dot when there is one, and a chevron. The name sets no face —
// `<Text>` detects the script per string (§6), so one row works for Arabic and
// Latin names; the meta line is mono because it is digits.
import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron, Dot } from '../../../components/ui';
import { color, size, space, Text } from '../../../theme';
import type { Patient } from '../data/types';
import { _LocalMoneyValue } from './_LocalMoneyValue';

export type _LocalPatientRowProps = {
    patient: Patient;
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
