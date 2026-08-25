/**
 * Single-line text input. The face follows the *value*, not the screen: a clinic
 * keeps Arabic and Latin question labels in one list, so an Arabic answer renders
 * in Noto Naskh even on an English screen (Component Inventory §6). An empty
 * field falls back to the placeholder's script so the caret does not jump
 * families on the first keystroke. The placeholder is drawn by `Placeholder`,
 * not by `TextInput` — see there.
 *
 * The ref reaches the inner `TextInput`, which is what makes a bulk entry form
 * possible: submit a row, get an empty form back with the caret already in the
 * first field. Without it the desk taps back into the name between every row of
 * a list that is hundreds long.
 */
import { forwardRef, useState } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, TextInput, View } from 'react-native';
import { color, containsArabic, font, radius, size, space, type } from '../../theme';
import type { FieldLayout } from './Field';
import { Field } from './Field';
import { Placeholder } from './Placeholder';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    /** The underlined control rather than the boxed one. `layout` is the separate question of where the label sits. */
    inline?: boolean;
    layout?: FieldLayout;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
    { label, required, hint, error, inline = false, layout, placeholder, ...input },
    ref,
) {
    const [focused, setFocused] = useState(false);
    const arabic = containsArabic(input.value || placeholder || '');

    return (
        <Field label={label} required={required} hint={hint} error={error} layout={layout}>
            <View
                style={[
                    styles.box,
                    inline ? styles.inline : styles.boxed,
                    focused && (inline ? styles.inlineFocused : styles.focused),
                    error ? styles.errored : null,
                ]}
            >
                <View style={styles.inputWrap}>
                    <TextInput
                        ref={ref}
                        accessibilityLabel={label ?? placeholder}
                        {...input}
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
                        ]}
                    />
                    <Placeholder text={placeholder} visible={!input.value} />
                </View>
            </View>
        </Field>
    );
});

const styles = StyleSheet.create({
    box: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
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
    inputWrap: { flex: 1, justifyContent: 'center' },
    input: { ...type.body, alignSelf: 'stretch', color: color.ink, paddingVertical: space[2] },
});
