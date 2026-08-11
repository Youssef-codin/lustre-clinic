/**
 * Numerals only, always DM Mono, always Latin digits (§7.11), so columns of
 * amounts stay aligned in Arabic too. `decimal-pad` rather than `numeric`: the
 * numeric pad on Android carries a newline key that commits nothing. The `end`
 * variant uses a physical textAlign resolved from the layout direction — React
 * Native has no logical `textAlign`, and `auto` would put a Latin numeral on the
 * wrong edge of an Arabic screen. Prefixes are units, never formatted numbers;
 * formatting is `domain/`'s.
 */
import { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { I18nManager, StyleSheet, TextInput, View } from 'react-native';
import { color, font, radius, size, space, Text, type } from '../../theme';
import { Field } from './Field';
import { Placeholder } from './Placeholder';

export type NumericFieldVariant = 'display' | 'end' | 'inline';

export type NumericFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'keyboardType'> & {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    variant?: NumericFieldVariant;
    prefix?: string;
    suffix?: string;
};

export function NumericField({
    label,
    required,
    hint,
    error,
    variant = 'end',
    prefix,
    suffix,
    placeholder,
    ...input
}: NumericFieldProps) {
    const [focused, setFocused] = useState(false);
    const display = variant === 'display';

    return (
        <Field label={label} required={required} hint={hint} error={error}>
            <View
                style={[
                    styles.box,
                    variant === 'inline' ? styles.inline : styles.boxed,
                    display && styles.display,
                    focused && (variant === 'inline' ? styles.inlineFocused : styles.focused),
                    error ? styles.errored : null,
                ]}
            >
                {prefix ? (
                    <Text variant={display ? 'headline' : 'callout'} tone="muted">
                        {prefix}
                    </Text>
                ) : null}

                <View style={styles.inputWrap}>
                    <TextInput
                        accessibilityLabel={label ?? placeholder}
                        {...input}
                        keyboardType="decimal-pad"
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
                            display ? styles.figure : styles.amount,
                            variant === 'end' && styles.endAligned,
                        ]}
                    />
                    <Placeholder
                        text={placeholder}
                        visible={!input.value}
                        variant={display ? 'figure' : 'amount'}
                        align={variant === 'end' ? 'end' : 'start'}
                    />
                </View>

                {suffix ? (
                    <Text variant="callout" tone="muted">
                        {suffix}
                    </Text>
                ) : null}
            </View>
        </Field>
    );
}

const END_ALIGN = I18nManager.isRTL ? 'left' : 'right';

const styles = StyleSheet.create({
    box: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    boxed: {
        minHeight: size.control,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    display: { minHeight: 62 },
    inline: { minHeight: size.row, borderBottomWidth: 1, borderBottomColor: color.hair },
    focused: { borderColor: color.ink },
    inlineFocused: { borderBottomColor: color.ink },
    errored: { borderColor: color.danger },
    inputWrap: { flex: 1, justifyContent: 'center' },
    input: { alignSelf: 'stretch', color: color.ink, paddingVertical: space[2] },
    figure: { ...type.figure, fontFamily: font.mono.medium },
    amount: { ...type.amount, fontFamily: font.mono.medium },
    endAligned: { textAlign: END_ALIGN },
});
