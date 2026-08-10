import { Pressable, StyleSheet, View } from 'react-native';
import { color, radius, space, Text } from '../../theme';

export type ReorderControlsProps = {
    onMoveUp: () => void;
    onMoveDown: () => void;
    /** True for the first row — the up arrow greys out rather than disappearing. */
    isFirst?: boolean;
    isLast?: boolean;
    /** Names the row being moved, for screen readers. */
    itemLabel?: string;
};

/**
 * The stacked arrows that replace a row's chevron in reorder mode. Arrows rather
 * than drag: reordering is rare, the rows are dense, and a long-press drag on a
 * list that also has a tappable price is a way to reprice a procedure by accident.
 */
export function ReorderControls({
    onMoveUp,
    onMoveDown,
    isFirst = false,
    isLast = false,
    itemLabel,
}: ReorderControlsProps) {
    const suffix = itemLabel ? ` ${itemLabel}` : '';

    return (
        <View style={styles.stack}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move up${suffix}`}
                accessibilityState={{ disabled: isFirst }}
                disabled={isFirst}
                onPress={onMoveUp}
                style={({ pressed }) => [
                    styles.button,
                    pressed && styles.pressed,
                    isFirst && styles.disabled,
                ]}
            >
                <Text variant="footnote" weight="semibold">
                    {'↑'}
                </Text>
            </Pressable>

            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move down${suffix}`}
                accessibilityState={{ disabled: isLast }}
                disabled={isLast}
                onPress={onMoveDown}
                style={({ pressed }) => [styles.button, pressed && styles.pressed, isLast && styles.disabled]}
            >
                <Text variant="footnote" weight="semibold">
                    {'↓'}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    stack: { gap: space[0.5] },
    button: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    pressed: { backgroundColor: color.surface2 },
    disabled: { opacity: 0.32 },
});
