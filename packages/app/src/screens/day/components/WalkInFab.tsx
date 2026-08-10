import { Pressable, StyleSheet } from 'react-native';
import { color, radius, shadow, size, Text } from '../../../theme';

/**
 * The one thing created from this screen (§7). `domain/BookFab` in the
 * inventory, and day-view only, so it stays in the cluster.
 *
 * Accent-filled: §3.1 scopes the blue to the FAB and this is the FAB. It floats
 * over the timeline rather than sitting in a bar, because the timeline scrolls
 * all day and the button must not scroll away with it.
 */

export type WalkInFabProps = {
    onPress: () => void;
};

export function WalkInFab({ onPress }: WalkInFabProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a walk-in"
            onPress={onPress}
            style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
            testID="walk-in-fab"
        >
            <Text variant="title3" tone="inverse">
                +
            </Text>
        </Pressable>
    );
}

const FAB = 56;

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        end: size.gutter,
        bottom: size.nav + size.dock,
        width: FAB,
        height: FAB,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: color.accent,
        boxShadow: shadow.fab,
    },
    pressed: { opacity: 0.9 },
});
