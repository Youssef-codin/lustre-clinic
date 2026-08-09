import { Pressable, StyleSheet } from 'react-native';
import { color, radius, size, space, Text } from '../../theme';

export type AddButtonVariant = 'full' | 'row' | 'footer' | 'compact';

export type AddButtonProps = {
    label: string;
    onPress?: () => void;
    /**
     * `full` — dashed accent block (add an option)
     * `row` — inset dashed row inside a list
     * `footer` — in-card footer ("Add to UL6")
     * `compact` — filled ink pill in an editor toolbar
     */
    variant?: AddButtonVariant;
    disabled?: boolean;
    testID?: string;
};

export function AddButton({ label, onPress, variant = 'full', disabled = false, testID }: AddButtonProps) {
    const compact = variant === 'compact';

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [
                styles.base,
                variant === 'full' && styles.full,
                variant === 'row' && styles.row,
                variant === 'footer' && styles.footer,
                compact && styles.compact,
                pressed && styles.pressed,
                disabled && styles.disabled,
            ]}
        >
            <Text variant="callout" weight="medium" tone={compact ? 'inverse' : 'accent'}>
                {`+  ${label}`}
            </Text>
        </Pressable>
    );
}

const dashed = {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.accent,
} as const;

const styles = StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: size.row,
        paddingHorizontal: space[3],
    },
    full: { ...dashed, alignSelf: 'stretch', borderRadius: radius.md },
    row: { ...dashed, alignSelf: 'stretch', borderRadius: radius.md, marginHorizontal: space[3] },
    footer: { alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: color.hair },
    compact: { alignSelf: 'flex-start', borderRadius: radius.full, backgroundColor: color.ink },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.32 },
});
