import { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, TextInput } from 'react-native';
import { color, containsArabic, font, radius, size, space, type } from '../../theme';
import { Field } from './Field';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    /** Borderless — for a value sitting inline in a list row. */
    inline?: boolean;
};

/**
 * Single-line text input. White, r14, 48px, ink border on focus.
 *
 * The face follows the *value*, not the screen: a clinic keeps Arabic and Latin
 * question labels in one list, so an Arabic answer renders in Noto Naskh even on
 * an English screen (Component Inventory §6). Empty falls back to the placeholder's
 * script so the caret does not jump families on the first keystroke.
 */
export function TextField({ label, required, hint, error, inline = false, ...input }: TextFieldProps) {
    const [focused, setFocused] = useState(false);
    const arabic = containsArabic(input.value || input.placeholder || '');

    return (
        <Field label={label} required={required} hint={hint} error={error}>
            <TextInput
                {...input}
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
                    { fontFamily: arabic ? font.arabic.regular : font.sans.regular },
                    inline ? styles.inline : styles.boxed,
                    focused && (inline ? styles.inlineFocused : styles.focused),
                    error ? styles.errored : null,
                ]}
            />
        </Field>
    );
}

const styles = StyleSheet.create({
    input: { ...type.body, color: color.ink, paddingVertical: space[2] },
    boxed: {
        minHeight: size.control,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    focused: { borderColor: color.ink },
    errored: { borderColor: color.danger },
    inline: { minHeight: size.row, borderBottomWidth: 1, borderBottomColor: color.hair },
    inlineFocused: { borderBottomColor: color.ink },
});
