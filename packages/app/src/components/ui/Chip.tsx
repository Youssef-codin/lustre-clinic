import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { color, radius, size, space, Text } from '../../theme';

export type ChipProps = {
    label: string;
    selected?: boolean;
    onPress?: () => void;
    disabled?: boolean;
    /** The dashed accent "new…" affordance that opens an editor instead of selecting. */
    variant?: 'solid' | 'new';
    icon?: ReactNode;
    /** Chips in a wrapping row share the width; chips in a scroller do not. */
    grow?: boolean;
    testID?: string;
};

/**
 * One selectable chip. The designs grew three of these — procedure categories,
 * answer types, and the payment Full/Half/Nothing row (§4.2) — which are the same
 * control with different content.
 */
export function Chip({
    label,
    selected = false,
    onPress,
    disabled = false,
    variant = 'solid',
    icon,
    grow = false,
    testID,
}: ChipProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [
                styles.chip,
                variant === 'new' ? styles.new : styles.solid,
                selected && styles.selected,
                grow && styles.grow,
                pressed && styles.pressed,
                disabled && styles.disabled,
            ]}
        >
            {icon}
            <Text
                variant="callout"
                weight={selected ? 'semibold' : 'regular'}
                tone={selected ? 'inverse' : variant === 'new' ? 'accent' : 'ink'}
            >
                {label}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1.5],
        minHeight: size.row,
        paddingHorizontal: space[3],
        borderRadius: radius.md,
        borderWidth: 1,
    },
    solid: { borderColor: color.line, backgroundColor: color.surface },
    new: { borderColor: color.accent, borderStyle: 'dashed', backgroundColor: color.surface },
    selected: { backgroundColor: color.ink, borderColor: color.ink },
    grow: { flex: 1 },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.32 },
});
