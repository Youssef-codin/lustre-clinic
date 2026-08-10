import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chevron } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';

export type SettingsRowProps = {
    /** A glyph. There is no icon set yet, so the callers pass text. */
    icon: ReactNode;
    label: string;
    sub?: string;
    onPress: () => void;
    /** Sits before the chevron — a count, or a "3 closed" summary. */
    value?: string;
    testID?: string;
};

/**
 * A row on the settings index (Component Inventory §5): 32px icon tile, label
 * and sub, chevron. Cluster-local — nothing outside settings has an index like
 * this — but a candidate for `domain/` if a second one appears.
 */
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
