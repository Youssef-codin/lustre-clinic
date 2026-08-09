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
    /**
     * `display` — the 30px figure with a currency prefix (payment amount)
     * `end` — end-aligned with a unit suffix (duration, price in a row)
     * `inline` — borderless, underlines on focus (the per-line cost input)
     */
    variant?: NumericFieldVariant;
    /** Leading unit — `EGP`. Never a formatted number; formatting is `domain/`'s. */
    prefix?: string;
    /** Trailing unit — `min`. */
    suffix?: string;
};

/**
 * Numerals only, always DM Mono, always Latin digits — §7.11, so columns of
 * amounts stay aligned in Arabic too.
 *
 * `decimal-pad` rather than `numeric`: the numeric pad on Android carries a
 * newline key that commits nothing.
 */
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
    // React Native has no logical `textAlign`, and `auto` aligns to the string's
    // own direction — which for a Latin numeral on an Arabic screen is the wrong
    // edge. This is the one place a physical direction is correct, and it is
    // resolved from the layout direction rather than assumed.
    endAligned: { textAlign: END_ALIGN },
});
