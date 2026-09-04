/**
 * The pill track (System A) rather than System B's grid — the two designs draw
 * the same control twice and the pill is the one the tabbed screens use (§4.2).
 * Icons are drawn in `currentColor`; the caller decides the colour from
 * `selected`. The selected half is outlined, not just filled: on a track this
 * pale the fill alone is faint, and the border is what makes it read as a thing
 * sitting on top rather than a lighter patch of the same surface.
 *
 * The pill is one view that slides rather than a style on whichever half is
 * chosen, so the control shows the change instead of reporting it. That is also
 * the whole of the animation where this control switches between two panes:
 * moving the panes themselves fights the sheet resizing around them, while the
 * thumb is the thing the finger just pressed.
 *
 * The geometry comes from the first segment measuring itself — the halves are
 * `flex: 1` and therefore equal, so one measurement gives the width and the
 * step. Nothing is drawn until that arrives, which is one frame.
 */
// biome-ignore lint/style/noRestrictedImports: slides the thumb with `Animated.timing` when the selection moves, and stops it on cleanup
import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { border, color, radius, shadow, space, Text } from '../../theme';
import { duration, easing } from './motion';
import { useReducedMotion } from './useReducedMotion';

export type Segment<T extends string> = {
    value: T;
    label: string;
    icon?: (selected: boolean) => React.ReactNode;
};

/**
 * `md` is the control a screen is built around — a tab bar for two panes, the
 * thing the thumb goes to. `sm` is for a screen that already has a heavier
 * control above it: on the patient record the two openers are the buttons, and
 * a switch the same height as them makes the page read as four equal actions
 * rather than two actions and a view toggle.
 */
export type SegmentedControlSize = 'md' | 'sm';

export type SegmentedControlProps<T extends string> = {
    segments: readonly Segment<T>[];
    value: T;
    onChange: (value: T) => void;
    size?: SegmentedControlSize;
    accessibilityLabel?: string;
    testID?: string;
};

export function SegmentedControl<T extends string>({
    segments,
    value,
    onChange,
    size = 'md',
    accessibilityLabel,
    testID,
}: SegmentedControlProps<T>) {
    const index = Math.max(
        0,
        segments.findIndex((segment) => segment.value === value),
    );
    const [slot, setSlot] = useState<{ x: number; width: number } | null>(null);
    const slide = useRef(new Animated.Value(0)).current;
    const placed = useRef(false);
    const reducedMotion = useReducedMotion();

    const step = slot ? slot.x + index * slot.width : 0;

    // biome-ignore lint/correctness/useExhaustiveDependencies: the step is the change
    useEffect(() => {
        if (!slot) return;

        // The first placement is where the pill already is, not a move to play.
        if (!placed.current) {
            placed.current = true;
            slide.setValue(step);
            return;
        }

        const animation = Animated.timing(slide, {
            toValue: step,
            duration: reducedMotion ? 0 : duration.fade,
            easing: easing.promote,
            useNativeDriver: true,
        });
        animation.start();

        return () => animation.stop();
    }, [step, slide, reducedMotion]);

    function onFirstSegmentLayout(event: LayoutChangeEvent) {
        const { x, width } = event.nativeEvent.layout;
        if (slot && slot.x === x && slot.width === width) return;
        setSlot({ x, width });
    }

    return (
        <View
            accessibilityRole="tablist"
            accessibilityLabel={accessibilityLabel}
            style={styles.track}
            testID={testID}
        >
            {slot ? (
                <Animated.View
                    pointerEvents="none"
                    style={[styles.thumb, { width: slot.width, transform: [{ translateX: slide }] }]}
                />
            ) : null}

            {segments.map((segment, at) => {
                const selected = segment.value === value;
                return (
                    <Pressable
                        key={segment.value}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        onLayout={at === 0 ? onFirstSegmentLayout : undefined}
                        onPress={() => onChange(segment.value)}
                        style={[styles.segment, size === 'sm' && styles.segmentSm]}
                    >
                        {segment.icon?.(selected)}
                        <Text
                            variant={size === 'sm' ? 'subhead' : 'callout'}
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
    segmentSm: { minHeight: 30 },
    /** `left: 0` and not `start`: `layout.x` is measured from the left in both directions. */
    thumb: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        borderRadius: radius.full,
        backgroundColor: color.surface,
        borderWidth: border.hair,
        borderColor: color.line,
        boxShadow: shadow.pill,
    },
});
