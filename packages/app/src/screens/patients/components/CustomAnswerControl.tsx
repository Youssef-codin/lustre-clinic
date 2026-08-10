// The editor for one clinic question, chosen by its `kind`. No clinic's
// questions are named anywhere — a question added in settings appears here with
// no code change. The covered kinds are exactly `EDITABLE_KINDS`; any other
// kind (today only `date`, §7.9) never reaches this component, because the
// record renders it read-only.
import { StyleSheet, View } from 'react-native';
import { Field, NumericField, Select, Switch, TextField } from '../../../components/ui';
import { space, Text } from '../../../theme';
import type { CustomQuestion } from '../data/types';
import type { DraftValue } from './customFields';

export type CustomAnswerControlProps = {
    question: CustomQuestion;
    value: DraftValue;
    onChange: (value: DraftValue) => void;
    error?: string;
};

export function CustomAnswerControl({ question, value, onChange, error }: CustomAnswerControlProps) {
    const text = typeof value === 'string' ? value : '';

    switch (question.kind) {
        case 'text':
            return (
                <TextField
                    label={question.label}
                    required={question.required}
                    error={error}
                    value={text}
                    onChangeText={onChange}
                    placeholder="Not answered"
                    testID={`answer-${question.key}`}
                />
            );

        case 'number':
            return (
                <NumericField
                    label={question.label}
                    required={question.required}
                    error={error}
                    variant="end"
                    value={text}
                    onChangeText={onChange}
                    placeholder="—"
                    testID={`answer-${question.key}`}
                />
            );

        case 'select':
            return (
                <Select
                    label={question.label}
                    required={question.required}
                    error={error}
                    sheetTitle={question.label}
                    placeholder="Not answered"
                    options={(question.options ?? []).map((option) => ({ value: option, label: option }))}
                    value={text === '' ? null : text}
                    onChange={onChange}
                    testID={`answer-${question.key}`}
                />
            );

        case 'boolean':
            return (
                <Field label={question.label} required={question.required} error={error}>
                    <View style={styles.switchRow}>
                        <Text variant="body" tone={value === true ? 'ink' : 'muted'}>
                            {value === true ? 'Yes' : 'No'}
                        </Text>
                        <Switch
                            value={value === true}
                            onValueChange={onChange}
                            accessibilityLabel={question.label}
                            testID={`answer-${question.key}`}
                        />
                    </View>
                </Field>
            );

        case 'date':
            return null;
    }
}

const styles = StyleSheet.create({
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        alignSelf: 'stretch',
        gap: space[3],
    },
});
