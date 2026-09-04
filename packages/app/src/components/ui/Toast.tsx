/**
 * Ink pill, slides up 16px, leaves on a timer. The timer is cancelled while an
 * action is present and pressed, and restarted on every change of message — so
 * two toasts in a row do not share one deadline: `message` is a real dependency
 * even though it is not read in the effect, and a second toast replacing a first
 * without a gap gets its own full life, not the remainder of the one it
 * displaced.
 */
// biome-ignore lint/style/noRestrictedImports: two of them, both external — the slide `Animated.timing` with its unmount callback, and the `setTimeout` that dismisses the toast
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { color, radius, size, space, Text } from '../../theme';
import { easing, duration as motionDuration } from './motion';
import { useReducedMotion } from './useReducedMotion';

export type ToastProps = {
    visible: boolean;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    onDismiss: () => void;
    duration?: number;
    offset?: number;
    testID?: string;
};

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
            // The action dismisses the toast and the toast then slides out, so
            // it is still under the finger after it has been answered. Dead
            // once it is leaving, or Undo runs twice.
            pointerEvents={visible ? 'box-none' : 'none'}
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
