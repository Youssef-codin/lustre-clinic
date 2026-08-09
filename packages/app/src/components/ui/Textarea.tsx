import { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, TextInput, View } from 'react-native';
import { color, containsArabic, font, radius, space, type } from '../../theme';
import { Field } from './Field';
import { Placeholder } from './Placeholder';

export type TextareaProps = Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'multiline'> & {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    minHeight?: number;
};

export function Textarea({
    label,
    required,
    hint,
    error,
    minHeight = 76,
    placeholder,
    ...input
}: TextareaProps) {
    const [focused, setFocused] = useState(false);
    const arabic = containsArabic(input.value || placeholder || '');

    return (
        <Field label={label} required={required} hint={hint} error={error}>
            <View style={[styles.box, focused && styles.focused, error ? styles.errored : null]}>
                <View style={styles.inputWrap}>
                    <TextInput
                        accessibilityLabel={label ?? placeholder}
                        {...input}
                        multiline
                        textAlignVertical="top"
                        onFocus={(event) => {
                            setFocused(true);
                            input.onFocus?.(event);
                        }}
                        onBlur={(event) => {
                            setFocused(false);
                            input.onBlur?.(event);
                        }}
                        style={[
                            styles.input,
                            { minHeight, fontFamily: arabic ? font.arabic.regular : font.sans.regular },
                        ]}
                    />
                    <Placeholder text={placeholder} visible={!input.value} align="top" />
                </View>
            </View>
        </Field>
    );
}

const styles = StyleSheet.create({
    box: {
        alignSelf: 'stretch',
        padding: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    focused: { borderColor: color.ink },
    errored: { borderColor: color.danger },
    inputWrap: { alignSelf: 'stretch' },
    input: { ...type.body, alignSelf: 'stretch', color: color.ink, padding: 0 },
});
