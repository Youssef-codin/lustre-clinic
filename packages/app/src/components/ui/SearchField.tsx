import type { ReactNode } from 'react';
import type { TextInputProps } from 'react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { color, containsArabic, font, radius, size, space, Text, type } from '../../theme';
import { Placeholder } from './Placeholder';

export type SearchFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
    value: string;
    onChangeText: (value: string) => void;
    variant?: 'inline' | 'sheet';
    onClear?: () => void;
    /**
     * The magnifier. Defaults to the `⌕` glyph because `ui/` may not import an
     * icon library (§2's import rule) — a cluster that wants the designs' drawn
     * magnifier passes its own, rather than this file growing a dependency.
     */
    leading?: ReactNode;
};

export function SearchField({
    variant = 'inline',
    onClear,
    placeholder,
    leading,
    ...input
}: SearchFieldProps) {
    const arabic = containsArabic(input.value || placeholder || '');

    return (
        <View style={[styles.box, variant === 'sheet' ? styles.sheet : styles.inline]}>
            {leading ?? (
                <Text variant="callout" tone="muted">
                    {'⌕'}
                </Text>
            )}

            <View style={styles.inputWrap}>
                <TextInput
                    accessibilityLabel={placeholder}
                    {...input}
                    accessibilityRole="search"
                    returnKeyType="search"
                    autoCorrect={false}
                    style={[styles.input, { fontFamily: arabic ? font.arabic.regular : font.sans.regular }]}
                />
                <Placeholder text={placeholder} visible={!input.value} />
            </View>

            {input.value.length > 0 ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={10}
                    onPress={() => {
                        input.onChangeText('');
                        onClear?.();
                    }}
                >
                    <Text variant="callout" tone="muted">
                        {'✕'}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    box: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        gap: space[2],
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
    },
    inline: {
        minHeight: size.control,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    sheet: { minHeight: 42, backgroundColor: color.canvas },
    inputWrap: { flex: 1, justifyContent: 'center' },
    input: { ...type.body, alignSelf: 'stretch', color: color.ink, paddingVertical: space[2] },
});
