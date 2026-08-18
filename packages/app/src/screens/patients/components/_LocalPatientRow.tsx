// `_Local` per §10: `domain/PatientRow` is listed as shared but `domain/` does
// not exist yet. `patients-list.html`, followed structurally: name, then phone ·
// age sex in mono, an amount in `due` with a dot when there is one, and a
// chevron.
//
// Full-bleed on the page ground with a hairline above every row — including the
// first, which is what separates the list from the RECENT label. Not a card: the
// design runs the register edge to edge, and a white rounded block per row
// stripes the list and turns each patient into an object of their own.
//
// The name sets no face — `<Text>` detects the script per string (§6), so one
// row works for Arabic and Latin names; the meta line is mono because it is
// digits. Age and sex share one segment (`34 F`) as the design draws them: they
// are one fact about the person, and a third `·` reads as a third field.
//
// The amount is bare, no `EGP`. This is a flag that something is owed, not a
// statement of the balance — that is read in full on the record, under a heading
// that says it is money.
import { Pressable, StyleSheet, View } from 'react-native';
import { border, color, size, space, Text } from '../../../theme';
import type { Patient } from '../data/types';
import { _LocalMoneyValue } from './_LocalMoneyValue';
import { RowChevronIcon } from './icons';

export type _LocalPatientRowProps = {
    patient: Patient;
    due?: number;
    onPress: () => void;
};

export function _LocalPatientRow({ patient, due = 0, onPress }: _LocalPatientRowProps) {
    const person = [patient.age === null ? null : `${patient.age}`, patient.gender]
        .filter((part): part is string => Boolean(part))
        .join(' ');

    const meta = [patient.phone, person].filter(Boolean).join(' · ');

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={patient.name}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={`patient-row-${patient.id}`}
        >
            <View style={styles.text}>
                <Text variant="headline" weight="semibold" numberOfLines={1}>
                    {patient.name}
                </Text>
                <Text variant="footnote" weight="medium" tone="muted" script="mono" numberOfLines={1}>
                    {meta}
                </Text>
            </View>

            {due > 0 && (
                <View style={styles.due}>
                    <View style={styles.dueDot} />
                    <_LocalMoneyValue
                        amount={due}
                        tone="due"
                        variant="caption"
                        weight="medium"
                        symbol={false}
                    />
                </View>
            )}

            <RowChevronIcon size={15} stroke={color.muted} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: size.gutter,
        paddingVertical: space[3],
        backgroundColor: color.canvas,
        borderTopWidth: border.hair,
        borderTopColor: color.hair,
    },
    text: { flex: 1, minWidth: 0, gap: space[0.5] },
    due: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    // Not `ui/Dot`: that one animates and this one never pulses, so the row does
    // not carry an `Animated.Value` per patient down a list.
    dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.due },
    pressed: { backgroundColor: color.surface2 },
});
