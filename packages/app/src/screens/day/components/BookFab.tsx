/**
 * The one thing created from this screen (§7) — `domain/BookFab` in the
 * inventory, and day-view only, so it stays in the cluster. Accent-filled per
 * §3.1 (the blue is scoped to the FAB, and this is the FAB), and it floats over
 * the timeline rather than sitting in a bar, because the timeline scrolls all
 * day and the button must not scroll away with it.
 *
 * It carries its label rather than a bare `+`: this opens a booking, and a
 * booking is a walk-in *or* an appointment on a later day. A round `+` on the
 * day view read as "add someone to today", which is the whole reason the
 * scheduled half of the flow went unused.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { color, radius, shadow, size, space, Text } from '../../../theme';
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
            <View style={styles.glyph}>
                <PlusIcon size={18} stroke={color.inverse} />
            </View>
            <Text variant="callout" weight="semibold" tone="inverse">
                Book
            </Text>
        </Pressable>
    );
}

const FAB = 52;

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        end: size.gutter,
        bottom: space[6],
        height: FAB,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingStart: space[4],
        paddingEnd: space[5],
        borderRadius: radius.full,
        backgroundColor: color.accent,
        boxShadow: shadow.fab,
    },
    glyph: { alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.9 },
});
