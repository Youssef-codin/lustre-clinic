import { Pressable, StyleSheet, View } from 'react-native';
import { color, radius, size, space, Text } from '../../theme';

export type RadioProps = {
    selected: boolean;
    onPress?: () => void;
    label?: string;
    disabled?: boolean;
    accessibilityLabel?: string;
    testID?: string;
};

export function Radio({
    selected,
    onPress,
    label,
    disabled = false,
    accessibilityLabel,
    testID,
}: RadioProps) {
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={onPress}
            testID={testID}
            hitSlop={8}
            style={({ pressed }) => [
                styles.row,
                label ? styles.withLabel : null,
                pressed && styles.pressed,
                disabled && styles.disabled,
            ]}
        >
            <View style={[styles.ring, selected && styles.ringOn]}>
                {selected ? <View style={styles.fill} /> : null}
            </View>
            {label ? <Text variant="body">{label}</Text> : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    withLabel: { minHeight: size.row, alignSelf: 'stretch' },
    ring: {
        width: 22,
        height: 22,
        borderRadius: radius.full,
        borderWidth: 1.5,
        borderColor: color.line,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringOn: { borderColor: color.ink },
    fill: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: color.ink },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.32 },
});
