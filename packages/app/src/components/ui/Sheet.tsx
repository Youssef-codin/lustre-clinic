/**
 * Bottom sheet — slides up to 0 over `.24–.32s cubic-bezier(.32,.72,0,1)`, r26 top
 * corners, 38×4 grab handle (Component Inventory §4.3). The design writes the ride
 * as `translateY(102%)`; see `ride` below for why it is a fixed distance here
 * instead, and why a real percentage cannot be used.
 *
 * Keyboard handling: iOS gets `KeyboardAvoidingView` padding; Android is left to
 * `softwareKeyboardLayoutMode: resize` in app.json, which already shrinks the
 * window under the modal — adding padding there as well would double it. The
 * scroll cap is the window minus the keyboard, and `keyboardShouldPersistTaps="handled"`
 * keeps the first tap from being swallowed by the keyboard close. The sheet
 * stays mounted through the exit so it animates out; `requestClose` routes every
 * close path (including Android's hardware back, which `Modal` sends here via
 * `onRequestClose`) and refuses all of them while `dismissable` is false, so a
 * write in flight cannot be cancelled into an unknown state.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, size, space, Text } from '../../theme';
import { duration, easing } from './motion';
import { Scrim } from './Scrim';
import { useKeyboardHeight } from './useKeyboardHeight';
import { useReducedMotion } from './useReducedMotion';

export type SheetProps = {
    visible: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children?: ReactNode;
    footer?: ReactNode;
    maxHeightRatio?: number;
    dismissable?: boolean;
    testID?: string;
};

export function Sheet({
    visible,
    onClose,
    title,
    subtitle,
    children,
    footer,
    maxHeightRatio = 0.86,
    dismissable = true,
    testID,
}: SheetProps) {
    const progress = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);
    const [head, setHead] = useState(0);
    const [foot, setFoot] = useState(0);
    const body = useRef(new Animated.Value(0)).current;
    const bodyMeasured = useRef(0);
    /** What the scroll content last asked for, before any cap is applied. */
    const wanted = useRef(0);
    /** True while the sheet is sliding, so the body snaps instead of easing. */
    const riding = useRef(false);
    const keyboard = useKeyboardHeight();
    const reducedMotion = useReducedMotion();
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();

    /**
     * Mirrors `mounted` so the effect below can read it without listing it as a
     * dependency. Anything in that list restarts the ride: React re-runs the
     * effect, the cleanup stops the animation part-way, and a fresh one starts
     * from wherever it stopped with the full duration ahead of it again. On the
     * way down that reads as the sheet halting half-way and then carrying on.
     */
    const onScreen = useRef(visible);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            onScreen.current = true;
        }
        if (!visible && !onScreen.current) return;

        riding.current = true;

        const animation = Animated.timing(progress, {
            toValue: visible ? 1 : 0,
            duration: reducedMotion ? 0 : duration.sheet,
            easing: easing.sheet,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            riding.current = false;
            if (finished && !visible) {
                onScreen.current = false;
                setMounted(false);
            }
        });

        return () => {
            riding.current = false;
            animation.stop();
        };
    }, [visible, progress, reducedMotion]);

    function requestClose() {
        if (!dismissable) return;

        Keyboard.dismiss();
        onClose();
    }

    /**
     * A sheet whose content changes size — a step that swaps a search box for a
     * form — used to jump: its height is its content's, and the top edge moved a
     * screen's worth between two frames. So the scrolling part is given a height
     * of its own and eased to the next one, which is what makes the sheet ride
     * up and down instead of teleporting.
     *
     * `onContentSizeChange` is the measurement, and the reason this works where
     * measuring a clipped child does not: a scroll view reports what its content
     * wants, not what it was allowed. The cap is the sheet's own maximum less
     * everything that is not scrolling, and `maxHeight` repeats it in layout so
     * a keyboard opening under a tall sheet cannot push the body past the frame.
     */
    function fitBody(cap: number) {
        const next = Math.min(wanted.current, Math.max(0, Math.round(cap)));
        if (next === bodyMeasured.current) return;

        const first = bodyMeasured.current === 0;
        bodyMeasured.current = next;

        // Snapped while the sheet is still flying in: easing the height at the
        // same time puts a second animation on the same edge, and the two
        // together read as the sheet rising past where it lands.
        if (first || riding.current || reducedMotion) {
            body.setValue(next);
            return;
        }

        Animated.timing(body, {
            toValue: next,
            duration: duration.fade,
            easing: easing.sheet,
            useNativeDriver: false,
        }).start();
    }

    /**
     * The cap is only right once the chrome has been measured. `head` and `foot`
     * come from their own `onLayout`s, so on the first pass they are still 0 and
     * the cap is too generous by exactly their height — 810 against a true 659
     * on the booking sheet, measured. Commit against that and a body taller than
     * the real cap renders too tall, then shrinks the moment the chrome lands.
     *
     * So the content is recorded but not committed until the chrome is known,
     * and `fitBody` runs again below when it arrives.
     */
    function measureBody(content: number, cap: number) {
        wanted.current = Math.round(content);
        if (head === 0) return;

        fitBody(cap);
    }

    const availableHeight = window.height - (Platform.OS === 'ios' ? keyboard : 0);

    /**
     * The system navigation bar is the same class of problem as the keyboard and
     * was not being subtracted anywhere: on a three-button phone it is ~48dp of
     * the sheet's own bottom edge, which ate the footer's primary action and
     * sliced the last row of any sheet without one. A gesture bar asks for 24dp,
     * which `space[6]` already happened to cover — which is why this only ever
     * showed on a phone. The tab bar at the same edge reads the inset the same way.
     */
    const floor = space[6] + insets.bottom;
    const bodyCap = availableHeight * maxHeightRatio - head - foot - floor;

    /**
     * How far the sheet rides, and deliberately not its own height.
     *
     * Its height comes from the `onLayout` of the very view being animated, and
     * every way of using that is a trap. Read it once and you read it too early:
     * the first layout is the chrome alone, so the sheet travelled a fifth of
     * itself — a nudge on the way in, and on the way out it stopped short and
     * sat there until the unmount cut it, which is the halt half-way down. Wait
     * for a later layout and there may not be one. Keep reading it and a resize
     * rewrites the interpolation's `outputRange` mid-flight, which is the jump.
     *
     * So the distance is the tallest a sheet is allowed to be. It is known
     * before anything is measured, it cannot be moved by the content, and it is
     * always at least the sheet's height, so the sheet always starts off-screen.
     * The cost is that a short sheet starts further down than it needs to — but
     * the ease-out spends that early, so it is on screen and settling for the
     * part of the ride anyone watches.
     *
     * (`window.height` rather than `availableHeight`: the keyboard must not be
     * able to change this while the sheet is moving.)
     */
    const ride = Math.round(window.height * maxHeightRatio);

    // The commit `measureBody` held back, now that the chrome has been measured
    // and the cap is the real one.
    // biome-ignore lint/correctness/useExhaustiveDependencies: fitBody closes over this render's values; the cap is the input that matters.
    useEffect(() => {
        if (wanted.current > 0) fitBody(bodyCap);
    }, [bodyCap]);

    if (!mounted) return null;

    return (
        <Modal
            visible
            transparent
            animationType="none"
            onRequestClose={requestClose}
            statusBarTranslucent={false}
            testID={testID}
        >
            <View style={styles.root}>
                <Scrim opacity={progress} onPress={requestClose} />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.avoider}
                    pointerEvents="box-none"
                >
                    <Animated.View
                        style={[
                            styles.sheet,
                            { maxHeight: availableHeight * maxHeightRatio, paddingBottom: floor },
                            {
                                transform: [
                                    {
                                        translateY: progress.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [ride, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <View onLayout={(event) => setHead(event.nativeEvent.layout.height)}>
                            <View style={styles.handleRow}>
                                <View style={styles.handle} />
                            </View>

                            {title ? (
                                <View style={styles.header}>
                                    <Text variant="title3">{title}</Text>
                                    {subtitle ? (
                                        <Text variant="subhead" tone="muted">
                                            {subtitle}
                                        </Text>
                                    ) : null}
                                </View>
                            ) : null}
                        </View>

                        <Animated.View style={{ height: body, maxHeight: Math.max(0, bodyCap) }}>
                            <ScrollView
                                style={styles.scroll}
                                contentContainerStyle={styles.scrollContent}
                                onContentSizeChange={(_width, height) => measureBody(height, bodyCap)}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="interactive"
                                alwaysBounceVertical={false}
                            >
                                {children}
                            </ScrollView>
                        </Animated.View>

                        {footer ? (
                            <View
                                onLayout={(event) => setFoot(event.nativeEvent.layout.height)}
                                style={styles.footer}
                            >
                                {footer}
                            </View>
                        ) : null}
                    </Animated.View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    avoider: { justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: color.surface,
        borderTopStartRadius: radius.sheet,
        borderTopEndRadius: radius.sheet,
    },
    handleRow: { alignItems: 'center', paddingTop: space[2.5], paddingBottom: space[1] },
    handle: { width: 38, height: 4, borderRadius: radius.full, backgroundColor: color.line },
    header: { paddingHorizontal: size.gutter, paddingTop: space[2], paddingBottom: space[3], gap: space[1] },
    scroll: { flexGrow: 0 },
    scrollContent: { paddingHorizontal: size.gutter, paddingBottom: space[4], gap: space[3] },
    footer: {
        paddingHorizontal: size.gutter,
        paddingTop: space[3],
        borderTopWidth: 1,
        borderTopColor: color.hair,
        gap: space[2],
    },
});
