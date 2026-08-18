// One clinic question in the editor — `patient-edit.html`'s question list: the
// label, then the control the question's `kind` asks for, ruled off from the
// next one. No clinic's questions are named anywhere; a question added in
// settings appears here with no code change, and the covered kinds are exactly
// `EDITABLE_KINDS` (`date` is read-only for now, §7.9, and never reaches here).
//
// The label is drawn here rather than by `ui/Field` for one reason: the design
// marks a required question that has not been answered by colouring its whole
// label — label and star together — in `due`, and `Field` draws a `danger` star
// against an `ink2` label, which is the louder "you got this wrong" and not the
// quieter "this is still to ask". Everything below the label is `ui/`.
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Placeholder, Select, TextField } from '../../../components/ui';
import { color, font, radius, size, space, Text, type } from '../../../theme';
import type { CustomQuestion } from '../data/types';
import type { DraftValue } from './customFields';
import { NO, YES } from './customFields';

export type AnswerEditorProps = {
    question: CustomQuestion;
    value: DraftValue;
    onChange: (value: DraftValue) => void;
    /** Required and still blank — the design colours the label rather than writing a message. */
    missing?: boolean;
    error?: string;
};

export function AnswerEditor({ question, value, onChange, missing = false, error }: AnswerEditorProps) {
    return (
        <View style={styles.field}>
            <View style={styles.labelRow}>
                <Text variant="footnote" weight="medium" tone={missing ? 'due' : 'muted'}>
                    {question.label}
                </Text>
                {question.required ? (
                    <Text variant="footnote" weight="medium" tone={missing ? 'due' : 'muted'}>
                        {' *'}
                    </Text>
                ) : null}
            </View>

            <View style={styles.control}>
                <Control question={question} value={value} onChange={onChange} error={error} />
            </View>

            {error ? (
                <Text variant="caption" tone="danger" style={styles.error}>
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

function Control({ question, value, onChange, error }: Omit<AnswerEditorProps, 'missing'>) {
    switch (question.kind) {
        // Two buttons and not `ui/Switch`: a switch has no third state, and a
        // question nobody has asked yet is exactly that. `secondary` is the
        // design's outline (1.5px on `outline`) and `primary` its ink fill, so
        // the pair is the shared button at both of its ends. Pressing the
        // chosen half again unanswers it — the way back out of a mis-tap, and
        // the only thing here the mockup does not draw, because it draws a
        // record that has already been answered.
        case 'boolean':
            return (
                <View style={styles.pair}>
                    <Button
                        label="Yes"
                        variant={value === YES ? 'primary' : 'secondary'}
                        size="md"
                        pressLockMs={0}
                        onPress={() => onChange(value === YES ? '' : YES)}
                        style={styles.half}
                        testID={`answer-${question.key}-yes`}
                    />
                    <Button
                        label="No"
                        variant={value === NO ? 'primary' : 'secondary'}
                        size="md"
                        pressLockMs={0}
                        onPress={() => onChange(value === NO ? '' : NO)}
                        style={styles.half}
                        testID={`answer-${question.key}-no`}
                    />
                </View>
            );

        case 'select':
            return (
                <Select
                    options={(question.options ?? []).map((option) => ({ value: option, label: option }))}
                    value={value === '' ? null : value}
                    onChange={onChange}
                    placeholder="Not answered"
                    sheetTitle={question.label}
                    error={error}
                    testID={`answer-${question.key}`}
                />
            );

        case 'text':
            return (
                <TextField
                    value={value}
                    onChangeText={onChange}
                    placeholder="Not answered"
                    error={error}
                    testID={`answer-${question.key}`}
                />
            );

        // Not `ui/NumericField`, which draws its value at `type.amount` in DM
        // Mono — a 20px figure, sized for a price. A clinic question's number is
        // "14 months ago", and at money's size it shouts across a list of text
        // answers. Same box as `TextField` above it, mono digits inside it.
        case 'number':
            return <NumberBox question={question} value={value} onChange={onChange} error={error} />;

        case 'date':
            return null;
    }
}

function NumberBox({ question, value, onChange, error }: Omit<AnswerEditorProps, 'missing'>) {
    return (
        <View style={[styles.box, error ? styles.errored : null]}>
            {/* The input and its placeholder share a wrapper, as they do in
                `ui/TextField`. `Placeholder` is absolutely positioned at
                `start: 0`, and an absolute child anchors to its parent's border
                edge rather than its padding edge — so hung directly on the box
                it lands hard against the border while the typed value sits
                inset, and the field reads as two different left margins. */}
            <View style={styles.inputWrap}>
                <TextInput
                    accessibilityLabel={question.label}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                    style={styles.number}
                    testID={`answer-${question.key}`}
                />
                <Placeholder text="Not answered" visible={value === ''} />
            </View>
        </View>
    );
}

/**
 * A question the record holds an answer to and the editor cannot edit — today
 * only `date` (§7.9). Drawn rather than skipped: a question that vanishes from
 * the form reads as one the clinic stopped asking, which is a different thing
 * and is what deactivating a question means.
 */
export function ReadOnlyAnswer({ question, shown }: { question: CustomQuestion; shown: string | null }) {
    return (
        <View style={styles.field}>
            <View style={styles.labelRow}>
                <Text variant="footnote" weight="medium" tone="muted">
                    {question.label}
                </Text>
            </View>

            <View style={[styles.control, styles.box, styles.readOnly]}>
                <Text variant="body" tone={shown === null ? 'muted' : 'ink'}>
                    {shown ?? 'Not answered'}
                </Text>
                <Text variant="caption" tone="muted">
                    Read-only for now
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    // No horizontal padding: the editor wraps the list in the page gutter, and a
    // second inset would step the questions in from the card above them.
    field: { paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: color.line },
    labelRow: { flexDirection: 'row', alignItems: 'center' },
    control: { paddingTop: space[2] },
    error: { paddingTop: space[1] },

    pair: { flexDirection: 'row', gap: space[2] },
    half: { flex: 1 },

    // `ui/TextField`'s boxed geometry, so the number sits in the same box as the
    // text answer above it.
    box: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        minHeight: size.control,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    errored: { borderColor: color.danger },
    inputWrap: { flex: 1, justifyContent: 'center' },
    number: {
        ...type.body,
        alignSelf: 'stretch',
        color: color.ink,
        fontFamily: font.mono.medium,
        paddingVertical: space[2],
    },
    readOnly: {
        justifyContent: 'space-between',
        gap: space[2],
        backgroundColor: color.surface2,
        borderColor: color.hair,
    },
});
