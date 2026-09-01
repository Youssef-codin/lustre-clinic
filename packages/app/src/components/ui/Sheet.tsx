/**
 * Bottom sheet — `translateY(102%)` to 0 over `.24–.32s cubic-bezier(.32,.72,0,1)`,
 * r26 top corners, 38×4 grab handle (Component Inventory §4.3).
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
    const keyboard = useKeyboardHeight();
    const reducedMotion = useReducedMotion();
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();

    /**
     * How far the sheet rides in, and `0` until this open has been measured.
     *
     * The distance is the sheet's own height, which arrives from the `onLayout`
     * of the very view being animated — so it is taken once, before the ride
     * starts, and then left alone for the duration. Feeding a fresh height into
     * the interpolation mid-ride replaces its `outputRange` underneath the
     * running animation and the sheet jumps onto the new curve: that is the pop,
     * and it is worst on a sheet whose content resizes just after it opens, like
     * the calendar's day summary resolving from "Counting the month…".
     *
     * Until it is measured the sheet parks a whole window down, which is
     * off-screen for anything `maxHeightRatio` allows, so the frame it waits
     * shows nothing. It resets on close so the next open measures its own
     * content rather than riding the last one's height.
     */
    const [travel, setTravel] = useState(0);
    const riding = useRef(false);

    useEffect(() => {
        if (visible) setMounted(true);
        if (!visible && !mounted) return;
        if (visible && travel === 0) return;

        riding.current = true;

        const animation = Animated.timing(progress, {
            toValue: visible ? 1 : 0,
            duration: reducedMotion ? 0 : duration.sheet,
            easing: easing.sheet,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            if (!finished) return;

            riding.current = false;
            if (!visible) {
                setMounted(false);
                setTravel(0);
            }
        });

        return () => animation.stop();
    }, [visible, mounted, progress, reducedMotion, travel]);

    /**
     * Taken only at rest. Mid-ride it is the pop; once the ride is over,
     * adopting a resize keeps the exit dropping the sheet its full height.
     */
    function measureSheet(height: number) {
        if (riding.current) return;

        const next = Math.round(height * 1.02);
        if (next !== travel) setTravel(next);
    }

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
    function measureBody(content: number, cap: number) {
        const next = Math.min(Math.round(content), Math.max(0, Math.round(cap)));
        if (next === bodyMeasured.current) return;

        const first = bodyMeasured.current === 0;
        bodyMeasured.current = next;

        if (first || reducedMotion) {
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

    if (!mounted) return null;

    const rideFrom = travel > 0 ? travel : window.height;
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
                        onLayout={(event) => measureSheet(event.nativeEvent.layout.height)}
                        style={[
                            styles.sheet,
                            { maxHeight: availableHeight * maxHeightRatio, paddingBottom: floor },
                            {
                                transform: [
                                    {
                                        translateY: progress.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [rideFrom, 0],
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
