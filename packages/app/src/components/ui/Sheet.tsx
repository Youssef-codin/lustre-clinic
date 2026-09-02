/**
 * Bottom sheet — r26 top corners, 38×4 grab handle (Component Inventory §4.3),
 * now over `@gorhom/bottom-sheet`.
 *
 * The geometry used to be ours: a translate measured from the sheet's own
 * `onLayout` and a body height eased against a cap assembled from three more
 * measurements. Every one of those measurements is of a view that is mid-flight
 * or mid-layout, and the ordering between them is not guaranteed — which is
 * where the pop, the stall and the overshoot all came from, each a different
 * symptom of the same circularity. The library measures handle, content and
 * footer itself and drives the position on the UI thread, so none of it is a
 * race any more.
 *
 * The props are unchanged, deliberately: nine sheets and another worktree build
 * on this file, and none of them should have to know it was rewritten.
 *
 * The split maps onto the library's own: `handleComponent` is the grab handle
 * and the title block, `footerComponent` is the pinned footer, and the children
 * are the scrolling middle. That is what keeps the sizing out of our hands —
 * each piece is measured separately by the sheet rather than us trying to
 * subtract them from each other.
 *
 * Everything visible is still ours: the handle, the title, the backdrop's
 * colour and the surface all come from the theme, so the library supplies the
 * mechanics and none of the look.
 */
import type { BottomSheetBackdropProps, BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import {
    BottomSheetBackdrop,
    BottomSheetFooter,
    BottomSheetModal,
    BottomSheetScrollView,
    useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, size, space, Text } from '../../theme';
import { duration } from './motion';

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
    const sheet = useRef<BottomSheetModal>(null);
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();

    /**
     * The footer's height, so the scroll can end above it.
     *
     * `BottomSheetFooter` is positioned over the content rather than beside it,
     * so without this the last thing in the sheet sits underneath the footer —
     * the calendar's day summary disappeared behind "Go to this day". This is a
     * measurement, which everything else in this file was rewritten to avoid,
     * but it is an inert one: it feeds padding, not geometry, so a frame at the
     * wrong value costs a moment of the last row being low, not a jump.
     */
    const [footHeight, setFootHeight] = useState(0);

    /** The design's own duration, rather than the library's default spring. */
    const timing = useBottomSheetTimingConfigs({ duration: duration.sheet });

    /**
     * The system navigation bar is the same class of problem as the keyboard and
     * was not being subtracted anywhere: on a three-button phone it is ~48dp of
     * the sheet's own bottom edge, which ate the footer's primary action and
     * sliced the last row of any sheet without one. A gesture bar asks for 24dp,
     * which `space[6]` already happened to cover — which is why this only ever
     * showed on a phone. The tab bar at the same edge reads the inset the same way.
     */
    const floor = space[6] + insets.bottom;

    /** True once a close is under way, so the two paths cannot re-enter. */
    const closing = useRef(false);
    /** What the parent last asked for, readable from the dismiss callback. */
    const asked = useRef(visible);

    useEffect(() => {
        asked.current = visible;

        if (visible) {
            closing.current = false;
            sheet.current?.present();
            return;
        }

        // A close the user started is already running; asking again mid-flight
        // restarts it.
        if (closing.current) return;

        closing.current = true;
        sheet.current?.dismiss();
    }, [visible]);

    /**
     * Every sheet swallows the hardware back while it is up, which is what
     * `Modal`'s `onRequestClose` used to do. Without it the event runs past the
     * sheet to the activity and backs out of the app altogether — measured, the
     * sheet closed and the launcher came up behind it.
     *
     * A sheet that refuses to close refuses back too: it is still swallowed, it
     * just does not close anything. A write in flight cannot be cancelled into
     * an unknown state.
     */
    useEffect(() => {
        if (!visible) return;

        const guard = BackHandler.addEventListener('hardwareBackPress', () => {
            if (dismissable) onClose();
            return true;
        });
        return () => guard.remove();
    }, [visible, dismissable, onClose]);

    /**
     * Fires once the sheet has finished leaving, whoever started it — so the
     * parent is only told about the closes it did not start, a drag or a tap on
     * the backdrop. Telling it about its own would fire `onClose` twice for one
     * close, and not every caller can take that: some advance a flow or clear a
     * form there rather than just setting a flag.
     */
    const handleDismiss = useCallback(() => {
        closing.current = true;
        Keyboard.dismiss();
        if (asked.current) onClose();
    }, [onClose]);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                opacity={1}
                pressBehavior={dismissable ? 'close' : 'none'}
                style={[props.style, styles.backdrop]}
            />
        ),
        [dismissable],
    );

    const renderHandle = useCallback(
        () => (
            <View>
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
        ),
        [title, subtitle],
    );

    const renderFooter = useCallback(
        (props: BottomSheetFooterProps) =>
            footer ? (
                <BottomSheetFooter {...props} bottomInset={0}>
                    <View
                        onLayout={(event) => setFootHeight(event.nativeEvent.layout.height)}
                        style={[styles.footer, { paddingBottom: floor }]}
                    >
                        {footer}
                    </View>
                </BottomSheetFooter>
            ) : null,
        [footer, floor],
    );

    return (
        <BottomSheetModal
            ref={sheet}
            animationConfigs={timing}
            enableDynamicSizing
            maxDynamicContentSize={window.height * maxHeightRatio}
            enablePanDownToClose={dismissable}
            enableOverDrag={false}
            handleComponent={renderHandle}
            backdropComponent={renderBackdrop}
            footerComponent={renderFooter}
            backgroundStyle={styles.sheet}
            onDismiss={handleDismiss}
            keyboardBehavior="interactive"
            keyboardBlurBehavior="restore"
            android_keyboardInputMode="adjustResize"
        >
            <BottomSheetScrollView
                testID={testID}
                style={styles.scroll}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: footer ? footHeight + space[4] : floor },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
            >
                {children}
            </BottomSheetScrollView>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    backdrop: { backgroundColor: color.scrim },
    sheet: {
        backgroundColor: color.surface,
        borderTopStartRadius: radius.sheet,
        borderTopEndRadius: radius.sheet,
    },
    handleRow: { alignItems: 'center', paddingTop: space[2.5], paddingBottom: space[1] },
    handle: { width: 38, height: 4, borderRadius: radius.full, backgroundColor: color.line },
    header: { paddingHorizontal: size.gutter, paddingTop: space[2], paddingBottom: space[3], gap: space[1] },
    scroll: { flexGrow: 0 },
    scrollContent: { paddingHorizontal: size.gutter, gap: space[3] },
    footer: {
        paddingHorizontal: size.gutter,
        paddingTop: space[3],
        borderTopWidth: 1,
        borderTopColor: color.hair,
        gap: space[2],
        backgroundColor: color.surface,
    },
});
