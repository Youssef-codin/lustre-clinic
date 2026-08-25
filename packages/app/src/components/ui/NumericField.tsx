/**
 * Numerals only, always DM Mono, always Latin digits (§7.11), so columns of
 * amounts stay aligned in Arabic too. `decimal-pad` rather than `numeric`: the
 * numeric pad on Android carries a newline key that commits nothing. The `end`
 * variant uses a physical textAlign resolved from the layout direction — React
 * Native has no logical `textAlign`, and `auto` would put a Latin numeral on the
 * wrong edge of an Arabic screen. Prefixes are units, never formatted numbers;
 * formatting is `domain/`'s.
 *
 * `variant` is the box; `size` is the figure inside it. `amount` is the 20px
 * price the money screens are built around, and it is wrong for a number that
 * is not money — an age, a count, "14 months ago" — which reads as a total
 * being announced. `body` is that number at the size of the text around it. The
 * face stays mono either way: the digits are still tabular.
 *
 * The ref reaches the inner `TextInput` so a form can move the caret between
 * fields without owning one.
 */
import { forwardRef, useState } from 'react';
import type { TextInputProps } from 'react-native';
import { I18nManager, StyleSheet, TextInput, View } from 'react-native';
import { color, font, radius, size as sizes, space, Text, type } from '../../theme';
import type { FieldLayout } from './Field';
import { Field } from './Field';
import { Placeholder } from './Placeholder';

export type NumericFieldVariant = 'display' | 'end' | 'inline';
export type NumericFieldSize = 'amount' | 'body';

/** Each figure size is a `TextVariant`, so the placeholder is drawn at the one the value will land in. */
const FIGURE_STYLE = { figure: 'figure', amount: 'amount', body: 'bodySize' } as const;

export type NumericFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'keyboardType'> & {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    variant?: NumericFieldVariant;
    /** Ignored by `display`, which is the 30px figure and has its own size. */
    size?: NumericFieldSize;
    layout?: FieldLayout;
    prefix?: string;
    suffix?: string;
};

export const NumericField = forwardRef<TextInput, NumericFieldProps>(function NumericField(
    {
        label,
        required,
        hint,
        error,
        variant = 'end',
        size = 'amount',
        layout,
        prefix,
        suffix,
        placeholder,
        ...input
    },
    ref,
) {
    const [focused, setFocused] = useState(false);
    const display = variant === 'display';
    const figure = display ? 'figure' : size;

    return (
        <Field label={label} required={required} hint={hint} error={error} layout={layout}>
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
                        ref={ref}
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
                            styles[FIGURE_STYLE[figure]],
                            variant === 'end' && styles.endAligned,
                        ]}
                    />
                    <Placeholder
                        text={placeholder}
                        visible={!input.value}
                        variant={figure}
                        script="mono"
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
});

const END_ALIGN = I18nManager.isRTL ? 'left' : 'right';

const styles = StyleSheet.create({
    box: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    boxed: {
        minHeight: sizes.control,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    display: { minHeight: 62 },
    inline: { minHeight: sizes.row, borderBottomWidth: 1, borderBottomColor: color.hair },
    focused: { borderColor: color.ink },
    inlineFocused: { borderBottomColor: color.ink },
    errored: { borderColor: color.danger },
    inputWrap: { flex: 1, justifyContent: 'center' },
    input: { alignSelf: 'stretch', color: color.ink, paddingVertical: space[2] },
    figure: { ...type.figure, fontFamily: font.mono.medium },
    amount: { ...type.amount, fontFamily: font.mono.medium },
    bodySize: { ...type.body, fontFamily: font.mono.regular },
    endAligned: { textAlign: END_ALIGN },
});
