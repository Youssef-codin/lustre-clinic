import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { color, radius, size, space, Text } from '../../theme';
import { easing, duration as motionDuration } from './motion';
import { useReducedMotion } from './useReducedMotion';

export type ToastProps = {
    visible: boolean;
    message: string;
    /** Turns the toast into "Visit deleted · Undo" — §7.15, which had no target. */
    actionLabel?: string;
    onAction?: () => void;
    onDismiss: () => void;
    /** Time on screen, ms. An action gets longer, because it has to be read and hit. */
    duration?: number;
    /** Distance above the bottom edge — clear the nav, the action bar, or nothing. */
    offset?: number;
    testID?: string;
};

/**
 * Ink pill, slides up 16px, leaves on a timer.
 *
 * The timer is cancelled while an action is present and pressed, and restarted
 * on every change of message, so two toasts in a row do not share one deadline.
 */
export function Toast({
    visible,
    message,
    actionLabel,
    onAction,
    onDismiss,
    duration,
    offset = space[8],
    testID,
}: ToastProps) {
    const progress = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);
    const reducedMotion = useReducedMotion();
    const life = duration ?? (actionLabel ? 5000 : 2400);

    useEffect(() => {
        if (visible) setMounted(true);
        const animation = Animated.timing(progress, {
            toValue: visible ? 1 : 0,
            duration: reducedMotion ? 0 : motionDuration.toast,
            easing: easing.standard,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            if (finished && !visible) setMounted(false);
        });
        return () => animation.stop();
    }, [visible, progress, reducedMotion]);

    // `message` is not read in here, but it is a real dependency: a second toast
    // replacing a first one without a gap must get its own full life, not the
    // remainder of the one it displaced.
    // biome-ignore lint/correctness/useExhaustiveDependencies: a new message restarts the clock
    useEffect(() => {
        if (!visible) return;
        const timer = setTimeout(onDismiss, life);
        return () => clearTimeout(timer);
    }, [visible, message, life, onDismiss]);

    if (!mounted) return null;

    return (
        <Animated.View
            accessibilityLiveRegion="polite"
            pointerEvents="box-none"
            testID={testID}
            style={[
                styles.toast,
                { bottom: offset },
                {
                    opacity: progress,
                    transform: [
                        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                    ],
                },
            ]}
        >
            <Text variant="callout" tone="inverse" style={styles.message}>
                {message}
            </Text>

            {actionLabel ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={actionLabel}
                    hitSlop={8}
                    onPress={() => {
                        onAction?.();
                        onDismiss();
                    }}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                >
                    <Text variant="callout" weight="semibold" tone="inverse">
                        {actionLabel}
                    </Text>
                </Pressable>
            ) : null}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    toast: {
        position: 'absolute',
        start: size.gutter,
        end: size.gutter,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row,
        paddingHorizontal: space[4],
        paddingVertical: space[2.5],
        borderRadius: radius.lg,
        backgroundColor: color.ink,
    },
    message: { flex: 1 },
    action: { paddingStart: space[2] },
    pressed: { opacity: 0.6 },
});
