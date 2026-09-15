/**
 * Ink pill at the top of the screen, slides down 16px, leaves on a timer. The
 * top rather than the bottom, because every screen's action buttons are at the
 * bottom and a toast over them blocked the next press for as long as it lived.
 *
 * Swiping it up or to either side dismisses it early. The pan only claims a
 * move past a few points, so a tap still reaches the action.
 *
 * The timer is restarted on every change of message — so two toasts in a row
 * do not share one deadline: `message` is a real dependency even though it is
 * not read in the effect, and a second toast replacing a first without a gap
 * gets its own full life, not the remainder of the one it displaced.
 */
// biome-ignore lint/style/noRestrictedImports: two of them, both external — the slide `Animated.timing` with its unmount callback, and the `setTimeout` that dismisses the toast
import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet } from 'react-native';
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
    /** Distance from the top of the screen it is drawn in. */
    offset?: number;
    testID?: string;
};

/** How far a drag has to travel, up or sideways, to count as a dismissal. */
const SWIPE_UP = 16;
const SWIPE_SIDE = 64;
/** A flick short of the distance still dismisses at this speed. */
const FLICK = 0.5;

export function Toast({
    visible,
    message,
    actionLabel,
    onAction,
    onDismiss,
    duration,
    offset = space[2],
    testID,
}: ToastProps) {
    const progress = useRef(new Animated.Value(0)).current;
    const drag = useRef(new Animated.ValueXY()).current;
    const [mounted, setMounted] = useState(visible);
    const reducedMotion = useReducedMotion();
    const life = duration ?? (actionLabel ? 5000 : 2400);

    // Read through a ref so the responder, made once, dismisses with the
    // caller's current callback rather than the first render's.
    const dismiss = useRef(onDismiss);
    dismiss.current = onDismiss;
    // The same for the motion preference: a swipe let go short of dismissing
    // springs back, and with reduced motion it jumps back instead.
    const reduced = useRef(reducedMotion);
    reduced.current = reducedMotion;

    function restore() {
        if (reduced.current) {
            drag.setValue({ x: 0, y: 0 });
            return;
        }
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    }

    const pan = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
            // Up follows the finger; down is held at the edge it came from.
            onPanResponderMove: (_, g) => drag.setValue({ x: g.dx, y: Math.min(g.dy, 0) }),
            onPanResponderRelease: (_, g) => {
                const up = g.dy < -SWIPE_UP || g.vy < -FLICK;
                const side = Math.abs(g.dx) > SWIPE_SIDE || Math.abs(g.vx) > FLICK;
                if (up || side) {
                    dismiss.current();
                    return;
                }
                restore();
            },
            onPanResponderTerminate: () => restore(),
        }),
    ).current;

    useEffect(() => {
        if (visible) {
            setMounted(true);
            drag.setValue({ x: 0, y: 0 });
        }
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
    }, [visible, progress, drag, reducedMotion]);

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
            pointerEvents={visible ? 'auto' : 'none'}
            testID={testID}
            {...pan.panHandlers}
            style={[
                styles.toast,
                { top: offset },
                {
                    opacity: progress,
                    transform: [
                        {
                            translateY: Animated.add(
                                progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }),
                                drag.y,
                            ),
                        },
                        { translateX: drag.x },
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
        zIndex: 10,
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
