import { Pressable, StyleSheet, View } from 'react-native';
import { color, radius, space, Text } from '../../theme';

export type StepperProps = {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    accessibilityLabel?: string;
    testID?: string;
};

/** −/value/+ on a grey track. Quantities, never money. */
export function Stepper({
    value,
    onChange,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    step = 1,
    accessibilityLabel,
    testID,
}: StepperProps) {
    const canDecrement = value - step >= min;
    const canIncrement = value + step <= max;

    return (
        <View
            accessibilityRole="adjustable"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ now: value, min, max }}
            style={styles.track}
            testID={testID}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease"
                disabled={!canDecrement}
                onPress={() => onChange(value - step)}
                style={({ pressed }) => [
                    styles.button,
                    pressed && styles.pressed,
                    !canDecrement && styles.disabled,
                ]}
            >
                <Text variant="headline" weight="medium">
                    −
                </Text>
            </Pressable>

            <View style={styles.value}>
                <Text variant="amount">{String(value)}</Text>
            </View>

            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase"
                disabled={!canIncrement}
                onPress={() => onChange(value + step)}
                style={({ pressed }) => [
                    styles.button,
                    pressed && styles.pressed,
                    !canIncrement && styles.disabled,
                ]}
            >
                <Text variant="headline" weight="medium">
                    +
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        padding: space[0.5],
        borderRadius: radius.md,
        backgroundColor: color.surface2,
    },
    button: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
    },
    value: { minWidth: 62, alignItems: 'center' },
    pressed: { backgroundColor: color.hair },
    disabled: { opacity: 0.32 },
});
