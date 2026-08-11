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
 */
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, type RefreshControlProps, ScrollView, StyleSheet } from 'react-native';
import { color } from '../../theme';

const MIN_VISIBLE_MS = 600;

/** What `ScrollView`'s `refreshControl` accepts — the type a component passing
 * its parent's gesture down should declare. */
export type RefreshControlElement = ReactElement<RefreshControlProps>;

/**
 * Returns the `refreshControl` element for a `ScrollView`. `refresh` is read
 * through a ref, so an inline arrow at the call site is fine.
 */
export function usePullToRefresh(refresh: () => void, busy: boolean): RefreshControlElement {
    const [refreshing, setRefreshing] = useState(false);
    const [floor, setFloor] = useState(false);

    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;

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

    useEffect(() => {
        if (!refreshing || busy || floor) return;
        setRefreshing(false);
    }, [refreshing, busy, floor]);

    return (
        <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.ink}
            colors={[color.ink]}
            progressBackgroundColor={color.surface}
        />
    );
}

export type RefreshViewProps = {
    /** Optional so a component can take one from its parent and pass it on. */
    refreshControl?: RefreshControlElement;
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
export function RefreshView({ refreshControl, children, testID }: RefreshViewProps) {
    return (
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            refreshControl={refreshControl}
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
