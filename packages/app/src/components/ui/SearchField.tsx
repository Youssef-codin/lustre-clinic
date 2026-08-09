import type { TextInputProps } from 'react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { color, containsArabic, font, radius, size, space, Text, type } from '../../theme';

export type SearchFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
    value: string;
    onChangeText: (value: string) => void;
    /** `sheet` is the shorter canvas-filled variant used inside a picker. */
    variant?: 'inline' | 'sheet';
    onClear?: () => void;
};

export function SearchField({ variant = 'inline', onClear, ...input }: SearchFieldProps) {
    const arabic = containsArabic(input.value || input.placeholder || '');

    return (
        <View style={[styles.box, variant === 'sheet' ? styles.sheet : styles.inline]}>
            <Text variant="callout" tone="muted">
                {'⌕'}
            </Text>

            <TextInput
                {...input}
                accessibilityRole="search"
                returnKeyType="search"
                autoCorrect={false}
                placeholderTextColor={color.muted}
                style={[styles.input, { fontFamily: arabic ? font.arabic.regular : font.sans.regular }]}
            />

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
    input: { ...type.body, flex: 1, color: color.ink, paddingVertical: space[2] },
});
