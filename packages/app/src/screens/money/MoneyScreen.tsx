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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Animated, AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MenuAnchor } from '../../components/ui';
import { DropdownMenu, IconButton, ScreenHeader, usePullToRefresh } from '../../components/ui';
import { color, radius, size, space, Text } from '../../theme';
import { todayKey } from '../day/time';
import { DebtorRow } from './components/DebtorRow';
import { DockedSearch, SEARCH_HEIGHT } from './components/DockedSearch';
import { HeroCollectionCard } from './components/HeroCollectionCard';
import { MoreIcon } from './components/icons';
import { LoadState, SkeletonCard, SkeletonRows } from './components/LoadState';
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

const HEADER_BUTTON = 40;

export type MoneyScreenProps = {
    /** False while a pane is pushed over this screen — see `MoneyCluster`. */
    searchVisible?: boolean;
    onOpenPatient: (patientId: string, name: string) => void;
};

export function MoneyScreen({ searchVisible = true, onOpenPatient }: MoneyScreenProps) {
    const [period, setPeriod] = useState<Period>('month');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<DebtorSort>('balance');
    const [sortAnchor, setSortAnchor] = useState<MenuAnchor | null>(null);

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

    const dock = useSearchDock();
    const hero = useHeroHeight();

    // The dashboard's three figures, for the period on screen — a pull does not
    // touch the other periods or the panes pushed over this one, which read
    // themselves when they open. The debtor search is client-side, so a refresh
    // while searching re-reads the same list and re-filters it.
    const refreshControl = usePullToRefresh(
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

    return (
        <View style={styles.screen} onLayout={dock.onScreenLayout}>
            <Animated.ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                refreshControl={refreshControl}
                scrollEventThrottle={16}
                onScroll={dock.onScroll}
                testID="money-screen"
            >
                <ScreenHeader
                    title="Finances"
                    trailing={
                        <IconButton accessibilityLabel="More" icon={<MoreIcon />} size={HEADER_BUTTON} />
                    }
                />

                <PeriodTabs value={period} onChange={setPeriod} />

                <View style={styles.statsHead}>
                    <Text variant="eyebrow" script="sans" weight="bold" tone="muted">
                        {statsPeriodLabel()}
                    </Text>
                    <Text variant="caption" weight="semibold" tone="muted">
                        {periodLabel}
                    </Text>
                </View>

                <View style={styles.bleed} onLayout={hero.onLayout}>
                    <LoadState
                        isLoading={summary.isLoading}
                        error={summary.error}
                        onRetry={summary.refetch}
                        skeleton={<SkeletonCard height={hero.minHeight} />}
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
                                    label="Older visits"
                                    amount={summary.data.olderCollected}
                                    sub={`collected · ${plural(summary.data.olderVisits, 'visit')}`}
                                    tone="older"
                                    testID="money-stat-older"
                                />
                                <StatCard
                                    label="Total due"
                                    amount={outstanding.data.total}
                                    sub={plural(outstanding.data.patients.length, 'patient')}
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

                <View style={styles.oweHead}>
                    <OweHead
                        total={searching ? null : (outstanding.data?.total ?? null)}
                        sort={sort}
                        sortOpen={sortAnchor !== null}
                        onOpenSort={setSortAnchor}
                    />
                </View>

                <View style={styles.searchSlot} onLayout={dock.onAnchorLayout} />

                <View style={styles.gutter}>
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
                                onOpenPatient={onOpenPatient}
                            />
                        ) : null}
                    </LoadState>
                </View>
            </Animated.ScrollView>

            {dock.ready && searchVisible ? (
                <DockedSearch
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search patients"
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
    onOpenPatient,
}: {
    debtors: PatientBalance[];
    shownOf: number;
    sort: DebtorSort;
    searching: boolean;
    onOpenPatient: (patientId: string, name: string) => void;
}) {
    // Two different facts, so two different sentences: a search that matched
    // nothing is not a clinic that is owed nothing.
    if (debtors.length === 0) {
        return searching ? (
            <View style={styles.searchEmpty}>
                <Text variant="subhead" tone="muted">
                    No patients found
                </Text>
            </View>
        ) : (
            <View style={styles.noDebtors}>
                <Text variant="callout" weight="semibold" tone="ink2">
                    No outstanding patients
                </Text>
                <Text variant="footnote" tone="muted">
                    All patient balances are settled
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
                        onPress={() => onOpenPatient(patient.patientId, patient.name)}
                    />
                ))}
            </View>

            <Text variant="footnote" tone="muted" style={styles.foot}>
                {`Showing ${debtors.length} of ${shownOf}${sort === 'balance' ? ' · largest balances' : ''}`}
            </Text>
        </View>
    );
}

function plural(count: number, noun: string): string {
    return `${count} ${count === 1 ? noun : `${noun}s`}`;
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

function useSearchDock() {
    const scrollY = useRef(new Animated.Value(0)).current;
    const anchor = useRef(new Animated.Value(0)).current;
    const slotY = useRef(Animated.subtract(anchor, scrollY)).current;

    // Where the pill sits once it has nothing left to follow. Measured off the
    // screen's own box rather than the scroller's, because that is the box the
    // pill is positioned inside.
    const [dockLine, setDockLine] = useState(0);

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
            }),
        ).current,
        onScreenLayout: (event: LayoutChangeEvent) =>
            setDockLine(event.nativeEvent.layout.height - size.dock - SEARCH_HEIGHT),
        onAnchorLayout: (event: LayoutChangeEvent) => anchor.setValue(event.nativeEvent.layout.y),
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
