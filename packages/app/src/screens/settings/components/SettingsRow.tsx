/**
 * A row on the settings index (Component Inventory §5): 32px icon tile, label
 * and sub, chevron. Settings is the only cluster with an index like this, so it
 * is cluster-local, but a candidate for `domain/` if a second one appears.
 *
 * The sub is not decoration and is never omitted: `settings.html` fills it with
 * the row's current answer — "default 30 min", "2 active · 1 inactive" — so the
 * index reads as a summary of the clinic's settings and most questions are
 * answered without opening anything.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';

export type SettingsRowProps = {
    icon: ReactNode;
    label: string;
    sub: string;
    onPress: () => void;
    testID?: string;
};

export function SettingsRow({ icon, label, sub, onPress, testID }: SettingsRowProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}. ${sub}`}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
            <View style={styles.tile}>{icon}</View>

            <View style={styles.text}>
                <Text variant="body" weight="semibold">
                    {label}
                </Text>
                <Text variant="footnote" tone="muted" numberOfLines={1}>
                    {sub}
                </Text>
            </View>

            <Chevron direction="forward" tone="muted" />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
    },
    pressed: { backgroundColor: color.surface2 },
    tile: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: color.canvas,
    },
    text: { flex: 1, minWidth: 0, gap: space[0.5] },
});
