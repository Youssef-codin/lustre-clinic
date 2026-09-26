// The money dashboard, against `money-dashboard-v2.html`. Every figure was
// computed by the server: this screen does not add, subtract, round, format or
// cache money. Three independent queries each render their own loading and
// error states, so one failure never takes another figure down.
//
// The debtor list is deliberately not period-filtered — an outstanding balance
// is standing, not period-scoped, and a list that emptied on "Today" would read
// as nobody owing anything. Search is client-side because `balance.outstanding`
// takes no argument, and the total beside "Who owe" is the report's own total:
// it is hidden while searching rather than recomputed over the filtered rows,
// because a figure that shrank as you typed would read as the clinic being owed
// less than it is.
import type { CopyVars } from '@lustre/shared';
// biome-ignore lint/style/noRestrictedImports: three of them, all external — the imperative `scrollTo` on the ScrollView ref when the tab is re-tapped, the same `scrollTo` holding the debtor list under a focused search, and the `AppState` subscription that re-reads the day on foreground
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Animated, AppState, type ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MenuAnchor } from '../../components/ui';
import { DropdownMenu, ScreenHeader, useKeyboardHeight, usePullToRefresh } from '../../components/ui';
import { useT } from '../../i18n';
import { color, radius, size, space, Text } from '../../theme';
import { todayKey } from '../day/time';
import { DebtorRow } from './components/DebtorRow';
import { DockedSearch, SEARCH_HEIGHT } from './components/DockedSearch';
import { HeroCollectionCard } from './components/HeroCollectionCard';
import { LoadState, SkeletonCard, SkeletonHeroCard, SkeletonRows } from './components/LoadState';
import { OweHead } from './components/OweHead';
import { PeriodTabs } from './components/PeriodTabs';
import { StatCard, StatCardSkeleton } from './components/StatCard';
import { TakingsCard } from './components/TakingsCard';
import { type PatientBalance, useBalanceSummary, useOutstanding, useTakings } from './data';
import { dueLabel, statsPeriodLabel, takingsLabel } from './format';
import {
    DEBTOR_SORT_LABEL,
    DEBTOR_SORTS,
    type DebtorSort,
    PERIOD_LABEL,
    type Period,
    periodRange,
    sortDebtors,
} from './money';

export type MoneyScreenProps = {
    /**
     * Bumped when the Money tab is tapped while it is already up. This screen is
     * the whole tab now, so home is the top of it rather than a pane to pop —
     * and the scroll offset is the one thing nothing above here can reach.
     */
    goHome?: number;
    /**
     * Tapping a debtor. It opens that patient's *record*, which is where a
     * payment is taken and where the per-visit history lives; the shell owns the
     * route because it crosses into the Patients tab. Only the id travels — the
     * record reads the patient for itself.
     */
    onOpenRecord?: (patientId: string) => void;
};

export function MoneyScreen({ goHome = 0, onOpenRecord }: MoneyScreenProps) {
    const t = useT();
    const [period, setPeriod] = useState<Period>('month');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<DebtorSort>('balance');
    const [sortAnchor, setSortAnchor] = useState<MenuAnchor | null>(null);
    const [searchFocused, setSearchFocused] = useState(false);

    const [today, rereadToday] = useToday();
    const range = useMemo(() => periodRange(period, today), [period, today]);

    const summary = useBalanceSummary(range);
    const takings = useTakings(range);
    const outstanding = useOutstanding();

    const periodLabel = PERIOD_LABEL[period];
    const searching = search.trim() !== '';

    const debtors = useMemo(() => {
        const rows = outstanding.data?.patients ?? [];
        const needle = search.trim().toLowerCase();

        const matched = needle
            ? rows.filter(
                  (row) =>
                      row.name.toLowerCase().includes(needle) ||
                      row.phone.replace(/\s/g, '').includes(needle),
              )
            : rows;

        return sortDebtors(matched, sort);
    }, [outstanding.data, search, sort]);

    const hero = useHeroHeight();

    // An effect because scrolling is imperative and there is nothing to derive —
    // the same shape `PatientListScreen` uses for the same signal. Skipped on
    // mount: a dashboard that has just been mounted is already at the top.
    // Home used to mean popping the two panes over this screen; they are gone,
    // so the top of the dashboard is all that is left of it.
    const scroller = useRef<ScrollView>(null);
    const shown = useRef(goHome);
    useEffect(() => {
        if (shown.current === goHome) return;
        shown.current = goHome;
        scroller.current?.scrollTo({ y: 0, animated: true });
    }, [goHome]);

    // The dashboard's three figures, for the period on screen — a pull does not
    // touch the other periods or the panes pushed over this one, which read
    // themselves when they open. The debtor search is client-side, so a refresh
    // while searching re-reads the same list and re-filters it.
    const pull = usePullToRefresh(
        () => {
            // Before the refetches, not after: a pull at 00:05 has to ask for
            // the new day, not re-send yesterday's range.
            rereadToday();
            summary.refetch();
            takings.refetch();
            outstanding.refetch();
        },
        summary.isLoading || takings.isLoading || outstanding.isLoading,
    );

    // What the list is currently showing, as one value the pin below can
    // compare. The count alone is not it: retyping one three-patient search
    // into a different three-patient search changes every row and no length.
    const shownKey = useMemo(() => debtors.map((row) => row.patientId).join(','), [debtors]);

    const dock = useSearchDock(pull.scrollProps.onScroll, scroller, searchFocused, shownKey);

    return (
        <View style={styles.screen} onLayout={dock.onScreenLayout}>
            <Animated.ScrollView
                ref={scroller}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                refreshControl={pull.refreshControl}
                scrollEventThrottle={16}
                onScroll={dock.onScroll}
                onScrollBeginDrag={pull.scrollProps.onScrollBeginDrag}
                onScrollEndDrag={pull.scrollProps.onScrollEndDrag}
                testID="money-screen"
            >
                {/* No overflow button. It was drawn with no handler, and every
                    action this screen has is already a control on it: the
                    period is the tabs, the sort is the head above the list,
                    and a refresh is the pull. A menu here would have to invent
                    something to hold. */}
                <ScreenHeader title={t('Finances')} />

                <PeriodTabs value={period} onChange={setPeriod} />

                <View style={styles.statsHead}>
                    <Text variant="eyebrow" script="sans" weight="bold" tone="muted">
                        {statsPeriodLabel()}
                    </Text>
                    <Text variant="caption" weight="semibold" tone="muted">
                        {t(periodLabel)}
                    </Text>
                </View>

                <View style={styles.bleed} onLayout={hero.onLayout}>
                    <LoadState
                        isLoading={summary.isLoading}
                        error={summary.error}
                        onRetry={summary.refetch}
                        skeleton={<SkeletonHeroCard height={hero.minHeight} />}
                    >
                        {summary.data ? (
                            <HeroCollectionCard
                                summary={summary.data}
                                dueLabel={dueLabel(periodLabel)}
                                minHeight={hero.minHeight}
                            />
                        ) : null}
                    </LoadState>
                </View>

                <View style={styles.gutter}>
                    <LoadState
                        isLoading={summary.isLoading || outstanding.isLoading}
                        error={summary.error ?? outstanding.error}
                        onRetry={() => {
                            summary.refetch();
                            outstanding.refetch();
                        }}
                        skeleton={
                            <View style={styles.stats}>
                                <StatCardSkeleton />
                                <StatCardSkeleton />
                            </View>
                        }
                    >
                        {summary.data && outstanding.data ? (
                            <View style={styles.stats}>
                                <StatCard
                                    label={t('Older visits')}
                                    amount={summary.data.olderCollected}
                                    sub={t('collected · {count}', {
                                        count: plural(t, summary.data.olderVisits, 'visit'),
                                    })}
                                    tone="older"
                                    testID="money-stat-older"
                                />
                                <StatCard
                                    label={t('Total due')}
                                    amount={outstanding.data.total}
                                    sub={plural(t, outstanding.data.patients.length, 'patient')}
                                    tone="due"
                                    testID="money-stat-total-due"
                                />
                            </View>
                        ) : null}
                    </LoadState>
                </View>

                <View style={[styles.gutter, styles.takings]}>
                    <LoadState
                        isLoading={takings.isLoading}
                        error={takings.error}
                        onRetry={takings.refetch}
                        skeleton={<SkeletonCard height={220} />}
                    >
                        {takings.data ? (
                            <TakingsCard takings={takings.data} label={takingsLabel(periodLabel)} />
                        ) : null}
                    </LoadState>
                </View>

                <View style={styles.oweHead} onLayout={dock.onHeadLayout}>
                    <OweHead
                        total={searching ? null : (outstanding.data?.total ?? null)}
                        sort={sort}
                        sortOpen={sortAnchor !== null}
                        onOpenSort={setSortAnchor}
                    />
                </View>

                <View style={styles.searchSlot} onLayout={dock.onAnchorLayout} />

                <View style={[styles.gutter, searchFocused && { minHeight: dock.listMinHeight }]}>
                    <LoadState
                        isLoading={outstanding.isLoading}
                        error={outstanding.error}
                        onRetry={outstanding.refetch}
                        skeleton={<SkeletonRows rows={4} />}
                    >
                        {outstanding.data ? (
                            <DebtorList
                                debtors={debtors}
                                shownOf={outstanding.data.patients.length}
                                sort={sort}
                                searching={searching}
                                onOpenRecord={onOpenRecord}
                            />
                        ) : null}
                    </LoadState>
                </View>
            </Animated.ScrollView>

            {dock.ready ? (
                <DockedSearch
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search patients"
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    translateY={dock.translateY}
                    dockOpacity={dock.dockOpacity}
                    dockScale={dock.dockScale}
                />
            ) : null}

            <DropdownMenu
                visible={sortAnchor !== null}
                onClose={() => setSortAnchor(null)}
                options={DEBTOR_SORTS.map((value) => ({ value, label: DEBTOR_SORT_LABEL[value] }))}
                value={sort}
                onChange={setSort}
                anchor={sortAnchor ?? undefined}
                accessibilityLabel="Sort patients"
            />
        </View>
    );
}

function DebtorList({
    debtors,
    shownOf,
    sort,
    searching,
    onOpenRecord,
}: {
    debtors: PatientBalance[];
    shownOf: number;
    sort: DebtorSort;
    searching: boolean;
    onOpenRecord?: (patientId: string) => void;
}) {
    const t = useT();
    // Two different facts, so two different sentences: a search that matched
    // nothing is not a clinic that is owed nothing.
    if (debtors.length === 0) {
        return searching ? (
            <View style={styles.searchEmpty}>
                <Text variant="subhead" tone="muted">
                    {t('No patients found')}
                </Text>
            </View>
        ) : (
            <View style={styles.noDebtors}>
                <Text variant="callout" weight="semibold" tone="ink2">
                    {t('No outstanding patients')}
                </Text>
                <Text variant="footnote" tone="muted">
                    {t('All patient balances are settled')}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.debtors}>
            <View style={styles.list}>
                {debtors.map((patient, index) => (
                    <DebtorRow
                        key={patient.patientId}
                        patient={patient}
                        index={index}
                        onPress={() => onOpenRecord?.(patient.patientId)}
                    />
                ))}
            </View>

            <Text variant="footnote" tone="muted" style={styles.foot}>
                {sort === 'balance'
                    ? t('Showing {count} of {total} · largest balances', {
                          count: debtors.length,
                          total: shownOf,
                      })
                    : t('Showing {count} of {total}', { count: debtors.length, total: shownOf })}
            </Text>
        </View>
    );
}

// The English plural is a suffix and the Arabic one is a different word, so
// both forms are catalogue keys and the count picks between them.
function plural(t: (copy: string, vars?: CopyVars) => string, count: number, noun: string): string {
    return t(count === 1 ? `{count} ${noun}` : `{count} ${noun}s`, { count });
}

// Which local day the period pills are measured from.
//
// `shell/AppShell` mounts a tab once and then hides it rather than unmounting
// it, so this screen can sit untouched for days. A day captured at first render
// would have the phone asking for yesterday under "Today" the next morning, and
// because the stale day is part of the query key, a pull would re-send the same
// range and re-confirm the wrong figures — there is no way out of it from the
// screen. So the day is re-read when the app comes back to the foreground, and
// again on every pull.
//
// Cheap to be liberal about: TanStack hashes an unchanged key identically, so a
// re-read on the same day is not a refetch. `AppState` is a subscription, which
// is what `useEffect` is actually for.
function useToday(): [string, () => void] {
    const [today, setToday] = useState(todayKey);

    const reread = useCallback(() => setToday(todayKey()), []);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') reread();
        });
        return () => subscription.remove();
    }, [reread]);

    return [today, reread];
}

// The search pill is an overlay, so its position has to be driven from here:
// only the screen knows where the slot ended up and how far it has been
// scrolled. The resting position is an `Animated` node on the native thread —
// it moves every frame of every scroll, and a JS-thread value lags the content
// on a flick and then snaps level, which reads as an ease-in-out. `docked` and
// `offscreen` are React state because they flip once, not per frame.
//
// Nothing here is React state, and nothing keeps a second copy of the scroll
// position. `anchor - scrollY` is where the slot currently is on screen; the
// clamp is what makes it stick: below the dock line it reads the dock line, and
// above it the pill just rides the list and scrolls off the top with it. The
// surface fades in over the last few pixels of the approach, off the same node.
//
// The previous version decided a `docked` boolean from a JS copy of the offset
// while the transform used the native value. A flung scroll drops its last JS
// event, the two disagreed, and the pill was positioned for a scroll that was
// no longer true — off the bottom of the screen, permanently.
// The hero's bottom edge lands here down the screen, which sets what the first
// screenful is: the hero, the two stat cards, and the top edge of the takings
// card showing there is more below. That is a rule about the device, not a
// height, so it is computed rather than hardcoded — the card's own offset
// inside the scroller plus the status bar is how far down it already starts,
// and the rest of the share is what it gets to fill. `MIN` is the floor for a
// short screen, where the share is less than the content needs.
const HERO_SCREEN_SHARE = 0.58;
const HERO_MIN = 240;

function useHeroHeight() {
    const window = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [top, setTop] = useState(0);

    return {
        minHeight: Math.max(HERO_MIN, window.height * HERO_SCREEN_SHARE - insets.top - top),
        onLayout: (event: LayoutChangeEvent) => setTop(event.nativeEvent.layout.y),
    };
}

// How much scroll the lift is spread over. The transition is linked to the
// scroll rather than run on a timer: it plays at the speed of the finger, it
// reverses when you reverse, and there is no duration to fall out of step with
// the position — which is what made the earlier timed version look like it was
// easing in and out on its own.
const DOCK_LIFT = 56;
const DOCK_SCALE = 0.975;
const FAR = 10_000;

/** `listener` is the pull-to-refresh's own scroll handler, which rides on the native event rather than replacing it. */
function useSearchDock(
    listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
    scroller: React.RefObject<ScrollView | null>,
    /** Whether the pill is being typed into. */
    focused: boolean,
    /** Which rows the list is showing, as one comparable value. */
    shown: string,
) {
    const scrollY = useRef(new Animated.Value(0)).current;
    const anchor = useRef(new Animated.Value(0)).current;
    const slotY = useRef(Animated.subtract(anchor, scrollY)).current;

    // The same offset as `anchor`, kept where JS can read it: an `Animated.Value`
    // drives the transform on the native thread and `scrollTo` is a JS call that
    // needs a number. The list's own head is what the scroll aims at rather than
    // the search slot — landing on the slot alone would put the pill at the top
    // of the screen with "Who owe" and its sort control scrolled off above it.
    const headY = useRef(0);
    const [headHeight, setHeadHeight] = useState(0);

    // Where the pill sits once it has nothing left to follow. Measured off the
    // screen's own box rather than the scroller's, because that is the box the
    // pill is positioned inside.
    //
    // The keyboard comes out of it because the box does not shrink around the
    // keys — `edgeToEdgeEnabled` lays the screen out behind the IME, so the
    // measured height is the whole window whether or not the keyboard is up
    // (see `ui/useKeyboardHeight`). Docked, the pill is the field being typed
    // into, and it sat under the keys the moment it was tapped. The height is
    // kept and the line derived from it rather than the line being stored: the
    // layout does not fire again when the keyboard moves, so a stored line
    // would keep the value it was measured with.
    /**
     * Search brings what it filters with it, and keeps it there.
     *
     * The pill docks to the bottom of the screen from anywhere on the
     * dashboard, so it was perfectly usable three screens above the list it
     * searches — you typed and watched a hero card not change. Focus scrolls
     * the list's own head to the top, which puts "Who owe", its sort and the
     * first rows under the keyboard's ceiling.
     *
     * `shown` is in here because filtering changes the page under the pin:
     * eight debtors down to one is a shorter scroll, the offset is clamped
     * back up, and the one match the search just found ends up below the fold.
     * Re-pinning whenever the rows change is what keeps the results where the
     * eye already is — the rows and not their count, so swapping one search
     * for another of the same length still brings its results up.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `shown` is the signal, not a value read — the list's rows changing is the thing worth re-pinning for
    useEffect(() => {
        if (!focused) return;
        scroller.current?.scrollTo({ y: headY.current, animated: true });
    }, [focused, shown, scroller]);

    const [screenHeight, setScreenHeight] = useState(0);
    const keyboard = useKeyboardHeight();
    const dockLine = screenHeight > 0 ? screenHeight - keyboard - size.dock - SEARCH_HEIGHT : 0;

    const translateY = useMemo(
        () =>
            slotY.interpolate({
                inputRange: [dockLine - FAR, dockLine],
                outputRange: [dockLine - FAR, dockLine],
                extrapolate: 'clamp',
            }),
        [slotY, dockLine],
    );

    const dockOpacity = useMemo(
        () =>
            slotY.interpolate({
                inputRange: [dockLine - DOCK_LIFT, dockLine],
                outputRange: [0, 1],
                extrapolate: 'clamp',
            }),
        [slotY, dockLine],
    );

    const dockScale = useMemo(
        () =>
            slotY.interpolate({
                inputRange: [dockLine - DOCK_LIFT, dockLine],
                outputRange: [DOCK_SCALE, 1],
                extrapolate: 'clamp',
            }),
        [slotY, dockLine],
    );

    return {
        translateY,
        dockOpacity,
        dockScale,
        // Until the screen has been measured the dock line is 0, which would
        // pin the pill to the top of the header for a frame.
        ready: dockLine > 0,
        onScroll: useRef(
            Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                useNativeDriver: true,
                listener,
            }),
        ).current,
        onScreenLayout: (event: LayoutChangeEvent) => setScreenHeight(event.nativeEvent.layout.height),
        onAnchorLayout: (event: LayoutChangeEvent) => anchor.setValue(event.nativeEvent.layout.y),
        onHeadLayout: (event: LayoutChangeEvent) => {
            headY.current = event.nativeEvent.layout.y;
            setHeadHeight(event.nativeEvent.layout.height);
        },
        /**
         * What the list has to be worth scrolling to, while it is being
         * searched. A filter that cuts eight debtors to one also cuts the
         * content shorter than a screen, and a scroll cannot move what it
         * cannot overscroll: the pin above asked for the head at the top, the
         * offset clamped at the bottom of a short page, and the single match
         * stayed under the keyboard.
         *
         * Reserving a screen's worth under the head makes that scroll possible.
         * It is whitespace below the last row for as long as the field is
         * focused, and the dashboard's own resting layout never sees it.
         */
        listMinHeight: Math.max(0, screenHeight - headHeight - SEARCH_HEIGHT),
    };
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingBottom: space[12] },
    gutter: { paddingHorizontal: size.gutter },
    bleed: { paddingHorizontal: size.bleed },
    statsHead: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: space[3],
        paddingHorizontal: size.gutter,
        paddingTop: space[4],
        paddingBottom: space[2.5],
    },
    stats: { flexDirection: 'row', gap: space[3], marginTop: space[5] },
    takings: { marginTop: space[4] },
    oweHead: { paddingTop: space[10], paddingBottom: space[1.5] },
    searchSlot: { height: SEARCH_HEIGHT, marginTop: space[3] },
    debtors: { marginTop: space[3], gap: space[3] },
    list: {
        borderRadius: radius.xl2,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
        overflow: 'hidden',
    },
    foot: { textAlign: 'center' },
    searchEmpty: {
        alignItems: 'center',
        padding: space[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: color.line,
        backgroundColor: color.surface2,
    },
    noDebtors: {
        alignItems: 'center',
        gap: space[1],
        padding: space[6],
        borderRadius: radius.xl2,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: color.line,
        backgroundColor: color.surface2,
    },
});
