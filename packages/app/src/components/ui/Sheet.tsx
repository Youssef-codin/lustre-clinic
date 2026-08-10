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
            if (finished && !visible) setMounted(false);
        });

        return () => animation.stop();
    }, [visible, progress, reducedMotion]);

    function requestClose() {
        if (!dismissable) return;

        Keyboard.dismiss();
        onClose();
    }

    if (!mounted) return null;

    const travel = sheetHeight > 0 ? sheetHeight * 1.02 : window.height;
    const availableHeight = window.height - (Platform.OS === 'ios' ? keyboard : 0);

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
