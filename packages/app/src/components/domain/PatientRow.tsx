/**
 * One patient in a list (Component Inventory §5) — the patients list, search
 * results, and the debtors list. `patients-list.html`, followed structurally:
 * name, then phone · age sex in mono, an amount in `due` with a dot when there
 * is one, and a chevron.
 *
 * Full-bleed on the page ground with a hairline above every row — including the
 * first, which is what separates the list from the RECENT label. Not a card: the
 * design runs the register edge to edge, and a white rounded block per row
 * stripes the list and turns each patient into an object of their own.
 *
 * The name sets no face — `<Text>` detects the script per string (§6), so one
 * row works for Arabic and Latin names; the meta line is mono because it is
 * digits. Age and sex share one segment (`34 F`) as the design draws them: they
 * are one fact about the person, and a third `·` reads as a third field.
 *
 * `balance` is piastres and renders bare, no `EGP`. It is a flag that something
 * is owed, not a statement of the balance — that is read in full on the record,
 * under a heading that says it is money. It is not a failure state either:
 * partial payment is normal (PRD), and nothing here presents it as an error.
 *
 * The shape is the server's: `patient.search` returns it, and `Partial` on the
 * derived fields is what lets a balance row, which only knows a name and a
 * phone, use the same component with no mapping layer.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import type { RouterOutput } from '../../api';
import { border, color, size, space, Text } from '../../theme';
import { Chevron } from '../ui';
import { MoneyValue } from './MoneyValue';

type SearchedPatient = RouterOutput['patient']['search'][number];

export type PatientSummary = Pick<SearchedPatient, 'name' | 'phone'> &
    Partial<Pick<SearchedPatient, 'id' | 'age' | 'gender'>>;

export type PatientRowProps = {
    patient: PatientSummary;
    balance?: number;
    onPress?: () => void;
    testID?: string;
};

export function PatientRow({ patient, balance = 0, onPress, testID }: PatientRowProps) {
    const { id, name, phone, age, gender } = patient;

    const person = [age === null || age === undefined ? null : `${age}`, gender]
        .filter((part): part is string => Boolean(part))
        .join(' ');

    const meta = [phone, person].filter(Boolean).join(' · ');

    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={name}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={testID ?? (id ? `patient-row-${id}` : undefined)}
        >
            <View style={styles.text}>
                <Text variant="headline" weight="semibold" numberOfLines={1}>
                    {name}
                </Text>
                <Text variant="footnote" weight="medium" tone="muted" script="mono" numberOfLines={1}>
                    {meta}
                </Text>
            </View>

            {balance > 0 ? (
                <View style={styles.due}>
                    <View style={styles.dueDot} />
                    <MoneyValue
                        piastres={balance}
                        variant="caption"
                        weight="medium"
                        tone="due"
                        showCurrency={false}
                    />
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
        paddingHorizontal: size.gutter,
        paddingVertical: space[3],
        backgroundColor: color.canvas,
        borderTopWidth: border.hair,
        borderTopColor: color.hair,
    },
    pressed: { backgroundColor: color.surface2 },
    text: { flex: 1, minWidth: 0, gap: space[0.5] },
    due: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    // Not `ui/Dot`: that one animates and this one never pulses, so the row does
    // not carry an `Animated.Value` per patient down a list.
    dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.due },
});
