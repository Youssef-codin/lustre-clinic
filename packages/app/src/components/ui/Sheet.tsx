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
import { color, radius, size, space, Text } from '../../theme';
import { duration, easing } from './motion';
import { Scrim } from './Scrim';
import { useKeyboardHeight } from './useKeyboardHeight';
import { useReducedMotion } from './useReducedMotion';

export type SheetProps = {
    visible: boolean;
    onClose: () => void;
    title?: string;
    /** Sits under the title in muted subhead. */
    subtitle?: string;
    children?: ReactNode;
    /**
     * Pinned below the scroll area — buttons stay reachable however long the
     * content is. Give it the actions, not content.
     */
    footer?: ReactNode;
    /** Fraction of the window the sheet may grow to before it scrolls. */
    maxHeightRatio?: number;
    /** A sheet mid-write should not be dismissable by tapping the scrim. */
    dismissable?: boolean;
    testID?: string;
};

/**
 * Bottom sheet — `translateY(102%)` to 0 over `.24–.32s cubic-bezier(.32,.72,0,1)`,
 * r26 top corners, 38x4 grab handle (Component Inventory §4.3).
 *
 * ## The keyboard
 *
 * Half the sheets in this app hold inputs — the tooth picker's search, the
 * catalogue search, every settings editor, the payment amount. A sheet that
 * ignores the keyboard puts its own footer under it, which is where the Save
 * button lives.
 *
 * Three things have to be true, and each is handled separately:
 *
 * 1. **The sheet moves.** `KeyboardAvoidingView` with `padding` on iOS. Android
 *    is left to `softwareKeyboardLayoutMode: resize` in app.json, which resizes
 *    the window under the modal — adding padding there as well would double it.
 * 2. **The content stays reachable.** The scroll area's cap is the window minus
 *    the keyboard, so a long form still scrolls to its end instead of stopping
 *    behind the keys.
 * 3. **The first tap counts.** `keyboardShouldPersistTaps="handled"` — without
 *    it the tap that closes the keyboard is swallowed, and the Save the user
 *    thinks they pressed never fired.
 */
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
    const [sheetHeight, setSheetHeight] = useState(0);
    const keyboard = useKeyboardHeight();
    const reducedMotion = useReducedMotion();
    const window = useWindowDimensions();

    useEffect(() => {
        if (visible) setMounted(true);

        const animation = Animated.timing(progress, {
            toValue: visible ? 1 : 0,
            duration: reducedMotion ? 0 : duration.sheet,
            easing: easing.sheet,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            // Stay mounted through the exit so it animates out rather than
            // vanishing; a cancelled run means another one took over.
            if (finished && !visible) setMounted(false);
        });

        return () => animation.stop();
    }, [visible, progress, reducedMotion]);

    function requestClose() {
        // The keyboard belongs to a field that is about to unmount. Dismissing it
        // first means one animation instead of two fighting.
        Keyboard.dismiss();
        onClose();
    }

    if (!mounted) return null;

    // 102% in the designs — the extra 2% keeps the shadow off the bottom edge.
    const travel = sheetHeight > 0 ? sheetHeight * 1.02 : window.height;
    const availableHeight = window.height - (Platform.OS === 'ios' ? keyboard : 0);

    return (
        <Modal
            visible
            transparent
            animationType="none"
            onRequestClose={requestClose}
            // Left opaque so Android's `resize` mode applies to the modal window;
            // with a translucent status bar it resizes the wrong one and the
            // keyboard covers the sheet.
            statusBarTranslucent={false}
            testID={testID}
        >
            <View style={styles.root}>
                <Scrim opacity={progress} onPress={dismissable ? requestClose : undefined} />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.avoider}
                    pointerEvents="box-none"
                >
                    <Animated.View
                        onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
                        style={[
                            styles.sheet,
                            { maxHeight: availableHeight * maxHeightRatio },
                            {
                                transform: [
                                    {
                                        translateY: progress.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [travel, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
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

                        <ScrollView
                            style={styles.scroll}
                            contentContainerStyle={styles.scrollContent}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="interactive"
                            alwaysBounceVertical={false}
                        >
                            {children}
                        </ScrollView>

                        {footer ? <View style={styles.footer}>{footer}</View> : null}
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
        // Clears the home indicator without a safe-area provider. Replace with a
        // real inset when one lands in the shell.
        paddingBottom: space[6],
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
