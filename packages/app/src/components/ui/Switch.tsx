import { useEffect, useRef } from 'react';
import { Animated, I18nManager, Pressable, StyleSheet } from 'react-native';
import { color, radius } from '../../theme';
import { duration, easing } from './motion';
import { useReducedMotion } from './useReducedMotion';

export type SwitchProps = {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    testID?: string;
};

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 28;
const KNOB = 22;
const TRAVEL = TRACK_WIDTH - KNOB - 6;

/** 46x28 track, 22px knob, ink when on. Mirrors in Arabic. */
export function Switch({ value, onValueChange, disabled = false, accessibilityLabel, testID }: SwitchProps) {
    const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        Animated.timing(progress, {
            toValue: value ? 1 : 0,
            duration: reducedMotion ? 0 : duration.popover,
            easing: easing.standard,
            useNativeDriver: true,
        }).start();
    }, [value, progress, reducedMotion]);

    const translate = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, I18nManager.isRTL ? -TRAVEL : TRAVEL],
    });

    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ checked: value, disabled }}
            disabled={disabled}
            onPress={() => onValueChange(!value)}
            testID={testID}
            hitSlop={8}
            style={[styles.track, value ? styles.on : styles.off, disabled && styles.disabled]}
        >
            <Animated.View style={[styles.knob, { transform: [{ translateX: translate }] }]} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    track: {
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: radius.full,
        padding: 3,
        justifyContent: 'center',
    },
    on: { backgroundColor: color.ink },
    off: { backgroundColor: color.surface2 },
    knob: {
        width: KNOB,
        height: KNOB,
        borderRadius: radius.full,
        backgroundColor: color.surface,
    },
    disabled: { opacity: 0.32 },
});
