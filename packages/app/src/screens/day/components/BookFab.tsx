/**
 * The one thing created from this screen (§7) — `domain/BookFab` in the
 * inventory, and day-view only, so it stays in the cluster. Accent-filled per
 * §3.1 (the blue is scoped to the FAB, and this is the FAB), and it floats over
 * the timeline rather than sitting in a bar, because the timeline scrolls all
 * day and the button must not scroll away with it.
 */
import { Pressable, StyleSheet } from 'react-native';
import { color, radius, shadow, size, space } from '../../../theme';
import { PlusIcon } from './icons';

export type BookFabProps = {
    onPress: () => void;
};

export function BookFab({ onPress }: BookFabProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Book an appointment or a walk-in"
            onPress={onPress}
            style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
            testID="book-fab"
        >
            <PlusIcon size={24} stroke={color.inverse} />
        </Pressable>
    );
}

const FAB = 52;

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        end: size.gutter,
        bottom: space[6],
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
