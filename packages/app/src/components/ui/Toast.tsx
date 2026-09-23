/**
 * Ink pill at the top of the screen, slides down 16px, leaves on a timer. The
 * top rather than the bottom, because every screen's action buttons are at the
 * bottom and a toast over them blocked the next press for as long as it lived.
 *
 * Swiping it up or to either side dismisses it early: it follows the finger,
 * fading as it goes, and is thrown on the way it was going; let go short and it
 * springs back. The pan only claims a move past a few points, so a tap still
 * reaches the action.
 *
 * The timer is restarted on every change of message — so two toasts in a row
 * do not share one deadline: `message` is a real dependency even though it is
 * not read in the effect, and a second toast replacing a first without a gap
 * gets its own full life, not the remainder of the one it displaced.
 */
// biome-ignore lint/style/noRestrictedImports: two of them, both external — the slide `Animated.timing` with its unmount callback, and the `setTimeout` that dismisses the toast
import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useT } from '../../i18n';
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
const SWIPE_UP = 20;
const SWIPE_SIDE = 56;
/** A flick short of the distance still dismisses at this speed, in px/ms. */
const FLICK = 0.4;
/** A downward drag moves a sixth as far as the finger, up to this. */
const PULL_DOWN = 8;
/** Up is the short way out: fully faded by here, and flung to twice it. */
const FADE_UP = 48;

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
    const t = useT();
    const { width } = useWindowDimensions();
    const progress = useRef(new Animated.Value(0)).current;
    const drag = useRef(new Animated.ValueXY()).current;
    const [mounted, setMounted] = useState(visible);
    const reducedMotion = useReducedMotion();
    const life = duration ?? (actionLabel ? 5000 : 2400);

    // The responder is made once, so everything it reads that can change
    // between renders goes through a ref.
    const latest = useRef({ onDismiss, reducedMotion, width });
    latest.current = { onDismiss, reducedMotion, width };
    // `leaving` makes a swipe dismiss once; `held` keeps the timer from pulling
    // the toast out from under a finger, and `expired` is the timer having
    // tried to — a swipe let go short of dismissing then dismisses anyway.
    const gesture = useRef({ leaving: false, held: false, expired: false }).current;

    function restore() {
        gesture.held = false;
        if (gesture.expired) {
            leave(0, 0);
            return;
        }
        if (latest.current.reducedMotion) {
            drag.setValue({ x: 0, y: 0 });
            return;
        }
        Animated.spring(drag, {
            toValue: { x: 0, y: 0 },
            damping: 22,
            stiffness: 260,
            useNativeDriver: true,
        }).start();
    }

    /** Carries on the way it was thrown, then hands over to the fade-out. */
    function leave(x: number, y: number) {
        gesture.leaving = true;
        gesture.held = false;
        latest.current.onDismiss();
        if (x === 0 && y === 0) return;
        if (latest.current.reducedMotion) {
            drag.setValue({ x, y });
            return;
        }
        Animated.timing(drag, {
            toValue: { x, y },
            duration: motionDuration.swipe,
            easing: easing.standard,
            useNativeDriver: true,
        }).start();
    }

    const pan = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) =>
                !gesture.leaving && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6),
            onPanResponderGrant: () => {
                gesture.held = true;
                // Caught mid-spring, it carries on from where it is rather
                // than jumping to under the finger.
                drag.stopAnimation();
                drag.extractOffset();
            },
            onPanResponderMove: (_, g) =>
                drag.setValue({ x: g.dx, y: g.dy < 0 ? g.dy : Math.min(g.dy / 6, PULL_DOWN) }),
            onPanResponderRelease: (_, g) => {
                drag.flattenOffset();
                if (Math.abs(g.dx) > Math.abs(g.dy)) {
                    const flick = Math.abs(g.vx) > FLICK && Math.sign(g.vx) === Math.sign(g.dx);
                    if (Math.abs(g.dx) > SWIPE_SIDE || flick) {
                        leave(Math.sign(g.dx) * latest.current.width, 0);
                        return;
                    }
                } else if (g.dy < -SWIPE_UP || g.vy < -FLICK) {
                    leave(g.dx, -FADE_UP * 2);
                    return;
                }
                restore();
            },
            onPanResponderTerminate: () => {
                drag.flattenOffset();
                restore();
            },
        }),
    ).current;

    // biome-ignore lint/correctness/useExhaustiveDependencies: a new message replacing one mid-swipe starts back in place
    useEffect(() => {
        if (visible) {
            setMounted(true);
            drag.stopAnimation();
            drag.setOffset({ x: 0, y: 0 });
            drag.setValue({ x: 0, y: 0 });
            gesture.leaving = false;
            gesture.expired = false;
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
    }, [visible, message, progress, drag, gesture, reducedMotion]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: a new message restarts the clock
    useEffect(() => {
        if (!visible) return;
        const timer = setTimeout(() => {
            if (gesture.held) gesture.expired = true;
            else onDismiss();
        }, life);
        return () => clearTimeout(timer);
    }, [visible, message, life, onDismiss, gesture]);

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
                    // Fades with the distance it has been dragged, so how far
                    // is left to go shows under the finger.
                    opacity: Animated.multiply(
                        progress,
                        Animated.multiply(
                            drag.x.interpolate({
                                inputRange: [-width * 0.6, 0, width * 0.6],
                                outputRange: [0, 1, 0],
                                extrapolate: 'clamp',
                            }),
                            drag.y.interpolate({
                                inputRange: [-FADE_UP, 0],
                                outputRange: [0, 1],
                                extrapolate: 'clamp',
                            }),
                        ),
                    ),
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
                {t(message)}
            </Text>

            {actionLabel ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(actionLabel)}
                    hitSlop={8}
                    onPress={() => {
                        onAction?.();
                        onDismiss();
                    }}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                >
                    <Text variant="callout" weight="semibold" tone="inverse">
                        {t(actionLabel)}
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
