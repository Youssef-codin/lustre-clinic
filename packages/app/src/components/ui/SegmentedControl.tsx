/**
 * The pill track (System A) rather than System B's grid — the two designs draw
 * the same control twice and the pill is the one the tabbed screens use (§4.2).
 * Icons are drawn in `currentColor`; the caller decides the colour from
 * `selected`. The selected half is outlined, not just filled: on a track this
 * pale the fill alone is faint, and the border is what makes it read as a thing
 * sitting on top rather than a lighter patch of the same surface.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { border, color, radius, shadow, space, Text } from '../../theme';

export type Segment<T extends string> = {
    value: T;
    label: string;
    icon?: (selected: boolean) => React.ReactNode;
};

export type SegmentedControlProps<T extends string> = {
    segments: readonly Segment<T>[];
    value: T;
    onChange: (value: T) => void;
    accessibilityLabel?: string;
    testID?: string;
};

export function SegmentedControl<T extends string>({
    segments,
    value,
    onChange,
    accessibilityLabel,
    testID,
}: SegmentedControlProps<T>) {
    return (
        <View
            accessibilityRole="tablist"
            accessibilityLabel={accessibilityLabel}
            style={styles.track}
            testID={testID}
        >
            {segments.map((segment) => {
                const selected = segment.value === value;
                return (
                    <Pressable
                        key={segment.value}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        onPress={() => onChange(segment.value)}
                        style={[styles.segment, selected && styles.selected]}
                    >
                        {segment.icon?.(selected)}
                        <Text
                            variant="callout"
                            weight={selected ? 'semibold' : 'medium'}
                            tone={selected ? 'ink' : 'ink2'}
                        >
                            {segment.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        flexDirection: 'row',
        alignSelf: 'stretch',
        padding: 3,
        borderRadius: radius.full,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface2,
    },
    segment: {
        flex: 1,
        flexDirection: 'row',
        gap: space[1.5],
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 38,
        paddingHorizontal: space[3],
        borderRadius: radius.full,
    },
    selected: {
        backgroundColor: color.surface,
        borderWidth: border.hair,
        borderColor: color.line,
        boxShadow: shadow.pill,
    },
});
