import { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, TextInput } from 'react-native';
import { color, containsArabic, font, radius, space, type } from '../../theme';
import { Field } from './Field';

export type TextareaProps = Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'multiline'> & {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    minHeight?: number;
};

export function Textarea({ label, required, hint, error, minHeight = 76, ...input }: TextareaProps) {
    const [focused, setFocused] = useState(false);
    const arabic = containsArabic(input.value || input.placeholder || '');

    return (
        <Field label={label} required={required} hint={hint} error={error}>
            <TextInput
                {...input}
                multiline
                textAlignVertical="top"
                placeholderTextColor={color.muted}
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
                    focused && styles.focused,
                    error ? styles.errored : null,
                ]}
            />
        </Field>
    );
}

const styles = StyleSheet.create({
    input: {
        ...type.body,
        color: color.ink,
        padding: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    focused: { borderColor: color.ink },
    errored: { borderColor: color.danger },
});
