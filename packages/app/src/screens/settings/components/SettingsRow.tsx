/**
 * A row on the settings index (Component Inventory §5): 32px icon tile, label
 * and sub, chevron. Settings is the only cluster with an index like this, so
 * it is cluster-local, but a candidate for `domain/` if a second one appears.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';

export type SettingsRowProps = {
    icon: ReactNode;
    label: string;
    sub?: string;
    onPress: () => void;
    value?: string;
    testID?: string;
};
export function SettingsRow({ icon, label, sub, onPress, value, testID }: SettingsRowProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={sub ? `${label}. ${sub}` : label}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
            <View style={styles.tile}>
                <Text variant="callout" tone="ink2">
                    {icon}
                </Text>
            </View>

            <View style={styles.text}>
                <Text variant="body" weight="medium">
                    {label}
                </Text>
                {sub ? (
                    <Text variant="subhead" tone="muted">
                        {sub}
                    </Text>
                ) : null}
            </View>

            {value ? (
                <Text variant="subhead" tone="muted">
                    {value}
                </Text>
            ) : null}
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
        paddingHorizontal: space[4],
        paddingVertical: space[2.5],
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
    text: { flex: 1, gap: space[0.5] },
});
