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
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import type { ReactNode } from 'react';
// biome-ignore lint/style/noRestrictedImports: drives `BottomSheetModal`'s imperative present/dismiss ref, which is the animation running outside React. The hardware back is `useHardwareBack`'s.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, size, space, Text } from '../../theme';
import { duration } from './motion';
import { useHardwareBack } from './useHardwareBack';
import { useKeyboardHeight } from './useKeyboardHeight';

export type SheetProps = {
    visible: boolean;
    onClose: () => void;
    /**
     * Fired once the sheet has finished leaving — every close, whoever started
     * it, unlike `onClose`.
     *
     * This is where anything that changes the screen underneath belongs. Closing
     * and navigating in the same tick puts the two on different clocks: the flag
     * is React's and lands in the next commit, while the exit is an animation
     * that only starts once `visible` has been through an effect — which is
     * behind the commit that mounts whatever is being navigated to. The sheet
     * then sits at full height, scrim and all, over the screen it is supposed to
     * be handing over to, and the confirm reads as if it did not take. Waiting
     * for this instead costs the exit's 300ms and spends them on the animation
     * the sheet already has.
     */
    onClosed?: () => void;
    title?: string;
    subtitle?: string;
    children?: ReactNode;
    footer?: ReactNode;
    maxHeightRatio?: number;
    dismissable?: boolean;
    /**
     * Whether dragging the body moves the sheet.
     *
     * Off for a body that scrolls on its own — a wheel, a picker — where the two
     * gestures are the same downward drag and the sheet wins it: the column
     * follows the finger for a few pixels and then the whole sheet leaves
     * instead. The handle and the backdrop still close it, so nothing is lost
     * but the shortcut.
     */
    dragFromBody?: boolean;
    testID?: string;
};

export function Sheet({
    visible,
    onClose,
    onClosed,
    title,
    subtitle,
    children,
    footer,
    maxHeightRatio = 0.86,
    dismissable = true,
    dragFromBody = true,
    testID,
}: SheetProps) {
    const sheet = useRef<BottomSheetModal>(null);
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();

    /**
     * The library's own curve, `Easing.out(Easing.exp)`, at the design's
     * duration. Overriding the easing as well is what the rewrite was meant to
     * stop doing.
     */
    const timing = useBottomSheetTimingConfigs({ duration: duration.sheet });

    /**
     * The system navigation bar is the same class of problem as the keyboard and
     * was not being subtracted anywhere: on a three-button phone it is ~48dp of
     * the sheet's own bottom edge, which ate the footer's primary action and
     * sliced the last row of any sheet without one. A gesture bar asks for 24dp,
     * which `space[6]` already happened to cover — which is why this only ever
     * showed on a phone. The tab bar at the same edge reads the inset the same way.
     */
    const keyboard = useKeyboardHeight();

    /**
     * The keyboard is in here because the window no longer gets out of its way.
     *
     * `edgeToEdgeEnabled` is on in `android/gradle.properties` — the Expo SDK
     * 54+ default — which lays the app out behind the system bars *and* behind
     * the IME. Under it `adjustResize` stops resizing anything, so
     * `android_keyboardInputMode` on the sheet and `softwareKeyboardLayoutMode`
     * in `app.json` are both set, both correct, and both inert. The sheet is
     * anchored to the bottom of a window that never got shorter, so it stayed
     * put and the keyboard covered the field being typed into.
     *
     * Growing the floor is what lifts it: the sheet sizes to its content
     * (`enableDynamicSizing`) and grows upwards from a fixed bottom edge, so
     * padding the bottom by the keyboard moves everything above it into view.
     *
     * `Math.max` rather than a sum, because the keyboard is drawn *over* the
     * navigation bar. Adding both would clear the bar twice and leave the sheet
     * floating a nav bar above the keys.
     */
    const floor = space[6] + Math.max(insets.bottom, keyboard);
    // `maxContent` is the cap when the keyboard is down. Shrinking it with the
    // keyboard (using `floor`) is what made the sheet *drop* when a field was
    // focused: `enableDynamicSizing` + a smaller `maxDynamicContentSize` tells
    // the sheet its content no longer fits, so it re-measures shorter and the
    // whole sheet slides down a keyboard height instead of the content lifting.
    const baseFloor = space[6] + insets.bottom;
    const maxContent = window.height * maxHeightRatio - baseFloor;

    /** True once a close is under way, so the two paths cannot re-enter. */
    const closing = useRef(false);
    /** What the parent last asked for, readable from the dismiss callback. */
    const asked = useRef(visible);
    /**
     * Whether this sheet has ever been presented.
     *
     * Almost every sheet mounts closed and opens later, and dismissing one that
     * was never presented leaves the library ignoring the `present()` that comes
     * after it — the sheet then never opens again, with no error and not even a
     * backdrop. Only the calendar escaped it, because it is remounted per open
     * and so mounts already visible.
     */
    const presented = useRef(false);
    /**
     * Whether the library has the sheet down, which is not the same question as
     * `visible` and can disagree with it.
     *
     * `visible` is what the parent wants; this is what actually happened. A
     * caller whose `onClose` swaps the sheet's *contents* rather than closing it
     * — the working-hours editor stepping back from the time wheel to its form —
     * leaves `visible` true through a drag or a backdrop tap. Without this the
     * effect is keyed on `visible` alone, never re-runs, and nothing calls
     * `present()` again: the sheet is off the screen while React still believes
     * it is up. No backdrop, no error, and the caller's own open flag stuck on,
     * so the next tap that would raise it sets a value that is already set and
     * does nothing at all.
     */
    const [down, setDown] = useState(false);

    useEffect(() => {
        asked.current = visible;

        if (visible) {
            closing.current = false;
            presented.current = true;
            // Putting it back up if the library dropped it while the parent
            // still wanted it. `present()` is a no-op on a sheet already up,
            // which is what makes running this on every dismissal safe.
            if (down) setDown(false);
            sheet.current?.present();
            return;
        }

        if (!presented.current) return;

        // A close the user started is already running; asking again mid-flight
        // restarts it.
        if (closing.current) return;

        closing.current = true;
        sheet.current?.dismiss();
    }, [visible, down]);

    /**
     * Every sheet swallows the hardware back while it is up, which is what
     * `Modal`'s `onRequestClose` used to do. Without it the event runs past the
     * sheet to the activity and backs out of the app altogether — measured, the
     * sheet closed and the launcher came up behind it.
     *
     * A sheet that refuses to close refuses back too: it is still swallowed, it
     * just does not close anything. A write in flight cannot be cancelled into
     * an unknown state.
     *
     * A sheet always wins over the screen it is covering, and nothing here
     * arranges that: the shell registered its listener when the app started and
     * this one registers when the sheet opens, which is later, and later is what
     * React Native asks first.
     */
    useHardwareBack(visible, () => {
        if (dismissable) onClose();
        return true;
    });

    /**
     * Fires once the sheet has finished leaving, whoever started it — so the
     * parent is only told about the closes it did not start, a drag or a tap on
     * the backdrop. Telling it about its own would fire `onClose` twice for one
     * close, and not every caller can take that: some advance a flow or clear a
     * form there rather than just setting a flag.
     *
     * `onClosed` is the other half and has no such asymmetry: it says the sheet
     * is off the screen, which is true of both closes and is the one moment
     * anything underneath may change.
     */
    const handleDismiss = useCallback(() => {
        closing.current = true;
        Keyboard.dismiss();
        if (asked.current) onClose();
        onClosed?.();
        // Last, and unconditionally: `onClose` has had its say by now, so the
        // effect that follows this render sees what the parent decided. If it
        // let `visible` go false this is the close it asked for and the effect
        // stops at `closing`; if it kept the sheet up, the sheet goes back up.
        setDown(true);
    }, [onClose, onClosed]);

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

    return (
        <BottomSheetModal
            ref={sheet}
            animationConfigs={timing}
            enableDynamicSizing
            // The cap is on the *content*; the handle and footer are added on
            // top of it. `topInset` is what actually stops a tall sheet from
            // reaching the status bar.
            maxDynamicContentSize={maxContent}
            topInset={insets.top}
            enablePanDownToClose={dismissable}
            enableContentPanningGesture={dragFromBody}
            /*
             * A sheet opened from inside another stacks on top of it, rather
             * than taking it down on the way up.
             *
             * The library's default is `switch`, which minimises whatever sheet
             * is currently up before presenting the new one. Minimising is
             * supposed to be recoverable — the outer sheet is restored when the
             * inner one goes — but it is driven by a status flag that any snap
             * landing in between overwrites, and `enableDismissOnClose` then
             * reads the close as a real dismissal. Our `onDismiss` fires,
             * `onClose` runs, and the caller unmounts the whole tree the inner
             * sheet was rendered from. That is why the Branch picker on Working
             * hours took the day editor with it and left no picker behind: the
             * inner sheet never got to present, because the React subtree it
             * lived in had already gone.
             *
             * `push` never touches the sheet underneath, so there is no status
             * to race and nothing to restore.
             */
            stackBehavior="push"
            enableOverDrag={false}
            handleComponent={renderHandle}
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.sheet}
            onDismiss={handleDismiss}
            keyboardBehavior="interactive"
            keyboardBlurBehavior="restore"
            android_keyboardInputMode="adjustResize"
        >
            {/*
             * The footer is ordinary content, not `footerComponent`.
             *
             * The library's footer is deliberately pinned to the bottom of the
             * container: it counter-translates by `containerHeight - position`,
             * so as the sheet rises the footer slides down inside it by very
             * nearly the same amount and stays put on screen. That is the
             * button arriving first and the sheet catching up behind it. Here
             * the footer belongs to the sheet, so it goes in the column and
             * rides the one transform with everything else.
             *
             * It goes inside the scroll rather than beside it because that is
             * the only place the sheet measures. A sibling column has no
             * definite height for the scroll to shrink against, so the footer
             * was laid out past the cap and clipped away entirely — the sheet
             * came up with no button at all. The cost is that on a sheet tall
             * enough to scroll, the action scrolls with the content.
             */}
            <BottomSheetScrollView
                testID={testID}
                contentContainerStyle={[styles.scrollContent, footer ? null : { paddingBottom: floor }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
            >
                {children}

                {footer ? <View style={[styles.footer, { paddingBottom: floor }]}>{footer}</View> : null}
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
    scrollContent: { paddingHorizontal: size.gutter, gap: space[3] },
    footer: {
        // Bleeds back out of the scroll's gutter so the rule above the action
        // still spans the sheet edge to edge.
        marginHorizontal: -size.gutter,
        paddingHorizontal: size.gutter,
        paddingTop: space[3],
        borderTopWidth: 1,
        borderTopColor: color.hair,
        gap: space[2],
        backgroundColor: color.surface,
    },
});
