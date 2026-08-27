// The BASICS block of `patient-edit.html`: one white card, four hairline-ruled
// rows, each a fixed-width label on the start edge and the value typed against
// it on the end edge.
//
// Not `ui/Field` + `ui/TextField`, which stack a label *above* a 48px boxed
// control — that is the rhythm of a form you fill in, and this is a card you
// correct. Four boxed fields here would be 260px of chrome for four short
// facts, and the design draws them as a list of what is on file. The label
// column is fixed at 78px so the four values line up as a column of their own;
// that number is the design's, and it is what `Full name` needs at 12px.
//
// The name sets no face — `<Text>`-style script detection is what puts an
// Arabic name in Noto Naskh, so the input picks its family from the value it
// holds (§6). The phone and the age are pinned to DM Mono for the same reason
// `domain/MoneyValue` is: they are figures, and an Arabic name in the row above
// must not drag them onto the Naskh face (§7.11).
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Card, CardDivider, Placeholder } from '../../../components/ui';
import { color, font, radius, space, Text, type } from '../../../theme';
import type { BasicsField, PatientForm } from '../patientForm';
import { ageDigits, FEMALE, MALE } from '../patientForm';

export type BasicsCardProps = {
    form: PatientForm;
    onChange: (patch: Partial<PatientForm>) => void;
    /**
     * Required and still empty. Marked the way the design marks an unanswered
     * required question — the label goes `due` — and not with a message: an
     * empty field the desk has not reached yet has nothing to correct.
     */
    blank: BasicsField[];
    /**
     * Typed and wrong, which does have something to correct — so it marks the
     * label the same way and, once the field has been left, says what is wrong
     * underneath it.
     */
    errors: Partial<Record<BasicsField, string>>;
};

export function BasicsCard({ form, onChange, blank, errors }: BasicsCardProps) {
    const owed = new Set(blank);

    // A message waits until the field has been left once. `s@` is not a valid
    // address, but neither is it a mistake — it is the second keystroke of one,
    // and telling the desk so on every character means the error is on screen
    // for the whole time it takes to type an email and gone only at the end.
    //
    // Left once, it stays live: the message updates as the field is corrected
    // and clears the moment the value is sound, which is when the desk is
    // actually looking for it.
    const [left, setLeft] = useState<BasicsField[]>([]);
    const seen = new Set(left);

    function leave(field: BasicsField) {
        setLeft((fields) => (fields.includes(field) ? fields : [...fields, field]));
    }

    function shown(field: BasicsField) {
        return seen.has(field) ? errors[field] : undefined;
    }

    // The label goes `due` for anything the save is waiting on, whether that is
    // an empty required field or a typed-and-wrong one whose sentence is still
    // being suppressed. Otherwise the footer counts something owed while
    // nothing on screen says which row it means.
    function due(field: BasicsField) {
        return owed.has(field) || errors[field] !== undefined;
    }

    return (
        <View>
            <Card>
                <Row label="Full name" error={shown('name')} owed={due('name')}>
                    <TextInput
                        accessibilityLabel="Full name"
                        value={form.name}
                        onChangeText={(name) => onChange({ name })}
                        onBlur={() => leave('name')}
                        autoCapitalize="words"
                        style={[styles.value, styles.sans]}
                        testID="patient-name"
                    />
                    <Placeholder text="As it is on the card" visible={form.name === ''} variant="callout" />
                </Row>

                <CardDivider />

                <Row label="Phone" error={shown('phone')} owed={due('phone')}>
                    <TextInput
                        accessibilityLabel="Phone"
                        value={form.phone}
                        onChangeText={(phone) => onChange({ phone })}
                        onBlur={() => leave('phone')}
                        keyboardType="phone-pad"
                        style={[styles.value, styles.mono]}
                        testID="patient-phone"
                    />
                    <Placeholder text="01xx xxx xxxx" visible={form.phone === ''} variant="callout" />
                </Row>

                <CardDivider />

                <Row label="Email" error={shown('email')} owed={due('email')}>
                    <TextInput
                        accessibilityLabel="Email"
                        value={form.email}
                        onChangeText={(email) => onChange({ email })}
                        onBlur={() => leave('email')}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={[styles.value, styles.sans]}
                        testID="patient-email"
                    />
                    <Placeholder text="Optional" visible={form.email === ''} variant="callout" />
                </Row>

                <CardDivider />

                {/* The design puts both on one line, and they belong together:
                    age and sex are the two things read off the card in one
                    breath, and neither is worth a row of its own. */}
                <Row label="Age · sex" error={shown('age')} owed={due('age')} align="center">
                    <View style={styles.ageSex}>
                        <View style={styles.age}>
                            <TextInput
                                accessibilityLabel="Age"
                                value={form.age}
                                // Digits and nothing else, so a number pad that
                                // carries a separator key and a pasted `34 yrs`
                                // both land as an age rather than as a message.
                                onChangeText={(text) => onChange({ age: ageDigits(text) })}
                                onBlur={() => leave('age')}
                                keyboardType="number-pad"
                                style={[styles.value, styles.mono]}
                                testID="patient-age"
                            />
                            <Placeholder text="—" visible={form.age === ''} variant="callout" />
                        </View>

                        <SexToggle value={form.gender} onChange={(gender) => onChange({ gender })} />
                    </View>
                </Row>
            </Card>
        </View>
    );
}

function Row({
    label,
    error,
    owed = false,
    align = 'flex-start',
    children,
}: {
    label: string;
    error?: string;
    owed?: boolean;
    align?: 'center' | 'flex-start';
    children: ReactNode;
}) {
    return (
        <View style={styles.row}>
            <View style={[styles.line, align === 'center' && styles.lineCentred]}>
                <Text variant="footnote" tone={owed ? 'due' : 'muted'} style={styles.label}>
                    {label}
                </Text>
                <View style={styles.field}>{children}</View>
            </View>

            {/* Under the row rather than beside it: the value column is narrow
                and a sentence in it would reflow the card. */}
            {error ? (
                <Text variant="caption" tone="danger" style={styles.error}>
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

/**
 * `F` / `M` on a pale track, the chosen half filled in `ink` — the design's own
 * control, and not `ui/SegmentedControl`, which is System A's pill: a *white*
 * thumb on `surface2`, sized for the two panes of a screen. Here the toggle
 * rides on the end of a line of type inside a card, and the filled half has to
 * read as an answer rather than as a tab.
 *
 * It also has a third state the segmented control cannot hold: neither half
 * chosen, which is a patient nobody recorded a sex for. Pressing the chosen
 * half again returns to it, so a mis-tap on a new patient is undoable — the
 * design draws no clear affordance because it draws a record that has one.
 */
function SexToggle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Sex">
            <Half
                label="F"
                selected={value === FEMALE}
                onPress={() => onChange(value === FEMALE ? '' : FEMALE)}
            />
            <Half label="M" selected={value === MALE} onPress={() => onChange(value === MALE ? '' : MALE)} />
        </View>
    );
}

function Half({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label === 'F' ? 'Female' : 'Male'}
            onPress={onPress}
            style={({ pressed }) => [styles.half, selected && styles.halfOn, pressed && styles.pressed]}
            testID={`patient-sex-${label}`}
        >
            <Text variant="footnote" weight="semibold" tone={selected ? 'inverse' : 'muted'}>
                {label}
            </Text>
        </Pressable>
    );
}

const LABEL_WIDTH = 78;

const styles = StyleSheet.create({
    row: { paddingHorizontal: space[3.5], paddingVertical: space[3] },
    line: { flexDirection: 'row', gap: space[3] },
    lineCentred: { alignItems: 'center' },
    label: { width: LABEL_WIDTH, flexGrow: 0, flexShrink: 0, paddingTop: space[0.5] },
    field: { flex: 1, justifyContent: 'center' },
    error: { paddingTop: space[1], marginStart: LABEL_WIDTH + space[3] },

    // `padding: 0` and a set line height: RN's default input padding is
    // platform-specific and would make the four rows different heights.
    value: { ...type.callout, color: color.ink, padding: 0, minHeight: type.callout.lineHeight },
    sans: { fontFamily: font.sans.semibold },
    mono: { fontFamily: font.mono.medium },

    ageSex: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    age: { minWidth: 34, justifyContent: 'center' },

    toggle: {
        flexDirection: 'row',
        padding: 3,
        borderRadius: radius.full,
        backgroundColor: color.surface2,
    },
    half: {
        minWidth: 34,
        paddingHorizontal: space[3],
        paddingVertical: space[1.5],
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    halfOn: { backgroundColor: color.ink },
    pressed: { opacity: 0.6 },
});
