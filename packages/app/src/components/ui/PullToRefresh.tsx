/**
 * Pull to refresh. One gesture, one spinner, one set of colours — every screen
 * that reads from the clinic gets it, and each one refetches its own queries
 * and nobody else's: the tabs stay mounted behind the one on screen (see
 * `AppShell`), so a "refresh everything" would re-read three screens the user
 * is not looking at, over Tailscale, on a phone. `/ws` already keeps the other
 * tabs honest; this gesture is for when it was not listening.
 *
 * `busy` is the screen's own loading flag, not something this hook can observe
 * — the query hooks are fire-and-forget (`refetch(): void`), so there is no
 * promise to await. The spinner is therefore held for `MIN_VISIBLE_MS` and for
 * as long as `busy` is true after that, whichever is longer. The floor is not
 * decoration: it covers the frame or two between the tap and a query hook's
 * state actually flipping, where `busy` is still false and a spinner without it
 * would blink out on a refresh that had not started yet. It also stops a
 * cache-fast answer flashing the control for 30ms, which reads as "nothing
 * happened" and gets pulled again.
 *
 * A `busy` that never goes false leaves the spinner up. That is deliberate —
 * every query hook in the app settles on both paths — and it is the honest
 * state for a read still crossing the tunnel.
 *
 * **A pull only counts when the list was already at the top when it started.**
 * Android's `SwipeRefreshLayout` stops listening while the list can still scroll
 * up, and it records where the finger went down only while it is listening. A
 * drag begun halfway down the list scrolled back to the top and then became a
 * pull measured from some earlier touch, so scrolling up to read the first rows
 * refreshed the screen. `scrollProps` is what lets the hook see the list: the
 * control is switched off for the whole of a drag that started below the top.
 */
// biome-ignore lint/style/noRestrictedImports: clears the floor `setTimeout` on unmount — an external timer, and the only effect left here
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    RefreshControl,
    type RefreshControlProps,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { color } from '../../theme';

const MIN_VISIBLE_MS = 600;

/** What `ScrollView`'s `refreshControl` accepts. */
export type RefreshControlElement = ReactElement<RefreshControlProps>;

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/** Spread onto the `ScrollView` that carries `refreshControl`. */
export type PullScrollProps = {
    onScroll: (event: ScrollEvent) => void;
    onScrollBeginDrag: (event: ScrollEvent) => void;
    onScrollEndDrag: (event: ScrollEvent) => void;
    scrollEventThrottle: number;
};

/** The whole gesture — the type a component passing its parent's pull down should declare. */
export type PullToRefresh = {
    refreshControl: RefreshControlElement;
    scrollProps: PullScrollProps;
};

/**
 * `refresh` is read through a ref, so an inline arrow at the call site is fine.
 */
export function usePullToRefresh(refresh: () => void, busy: boolean): PullToRefresh {
    const [refreshing, setRefreshing] = useState(false);
    const [floor, setFloor] = useState(false);
    const [enabled, setEnabled] = useState(true);

    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;

    const atTop = useRef(true);
    const dragging = useRef(false);

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setFloor(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            timer.current = null;
            setFloor(false);
        }, MIN_VISIBLE_MS);

        refreshRef.current();
    }, []);

    const onScroll = useCallback((event: ScrollEvent) => {
        atTop.current = event.nativeEvent.contentOffset.y <= 0;
        // Mid-drag the answer is the one the drag started with; reaching the top
        // under the finger is exactly what must not arm the pull.
        if (!dragging.current) setEnabled(atTop.current);
    }, []);

    const onScrollBeginDrag = useCallback((event: ScrollEvent) => {
        dragging.current = true;
        setEnabled(event.nativeEvent.contentOffset.y <= 0);
    }, []);

    const onScrollEndDrag = useCallback(() => {
        dragging.current = false;
        setEnabled(atTop.current);
    }, []);

    // Adjusted during render rather than in an effect: the spinner going down is
    // a fact about `busy` and `floor`, not a thing that happens to them, and an
    // effect would paint one frame of a spinner that has already finished.
    if (refreshing && !busy && !floor) setRefreshing(false);

    return {
        refreshControl: (
            <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                enabled={enabled}
                tintColor={color.ink}
                colors={[color.ink]}
                progressBackgroundColor={color.surface}
            />
        ),
        scrollProps: { onScroll, onScrollBeginDrag, onScrollEndDrag, scrollEventThrottle: 16 },
    };
}

export type RefreshViewProps = {
    /** Optional so a component can take one from its parent and pass it on. */
    pull?: PullToRefresh;
    children: ReactNode;
    testID?: string;
};

/**
 * A screen state that does not scroll — an empty day, a failed read — made
 * pullable anyway. The content keeps the full height it had as a `View`
 * (`flexGrow: 1`), so a centred empty state stays centred; only the gesture is
 * added. Without this, the states that most need a refresh — the ones with no
 * content — are the ones that cannot be pulled.
 */
export function RefreshView({ pull, children, testID }: RefreshViewProps) {
    return (
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            refreshControl={pull?.refreshControl}
            {...pull?.scrollProps}
            showsVerticalScrollIndicator={false}
            testID={testID}
        >
            {children}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    content: { flexGrow: 1 },
});
