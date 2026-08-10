import type { ClientRole } from '@mawid/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomTabBar, type TabKey } from '../components/domain';
import { DayScreen } from '../screens/day';
import { MoneyCluster } from '../screens/money';
import { PatientsCluster } from '../screens/patients';
import { SettingsScreen } from '../screens/settings';
import { color } from '../theme';

/**
 * The app shell (SPEC §18 F3) — what BLOCKED.md #3/#4 was waiting for. Four
 * clusters under one `domain/BottomTabBar`; each cluster keeps its own internal
 * stack (`PushView`, a route union), which is the shape they were all written
 * to and needs no change here.
 *
 * A tab is mounted the first time it is opened and then stays mounted, hidden
 * rather than unmounted. That is deliberate: the secretary leaves the day view
 * on some other date, checks a balance, and comes back — losing the date, the
 * scroll position and the in-flight queries every time would make the tab bar
 * feel like a reload button. The cost is four screens' worth of state in
 * memory, which for four screens is nothing.
 *
 * The shell owns the role, because it outlives the settings screen now that
 * settings is one tab of four (BLOCKED.md #12 — the hand-over `SettingsScreen`
 * left a seam for). It is still device-local and still switchable by whoever is
 * holding the phone; it gates rows, never access.
 */

export function AppShell() {
    const [tab, setTab] = useState<TabKey>('day');
    const [role, setRole] = useState<ClientRole>('doctor');
    const [visited, setVisited] = useState<TabKey[]>(['day']);

    function open(next: TabKey) {
        setTab(next);
        setVisited((current) => (current.includes(next) ? current : [...current, next]));
    }

    return (
        <View style={styles.root}>
            <View style={styles.body}>
                <Pane visible={tab === 'day'} mounted={visited.includes('day')}>
                    <DayScreen />
                </Pane>

                <Pane visible={tab === 'patients'} mounted={visited.includes('patients')}>
                    <PatientsCluster />
                </Pane>

                <Pane visible={tab === 'money'} mounted={visited.includes('money')}>
                    <MoneyCluster />
                </Pane>

                <Pane visible={tab === 'role'} mounted={visited.includes('role')}>
                    <SettingsScreen role={role} onChangeRole={setRole} />
                </Pane>
            </View>

            <BottomTabBar active={tab} role={role} onChange={open} />
        </View>
    );
}

/**
 * `display: 'none'` rather than a conditional render: the hidden tab keeps its
 * state and its React tree, and lays out nothing. `pointerEvents` is belt and
 * braces for a sheet mid-animation when the tab changes under it.
 */
function Pane({
    visible,
    mounted,
    children,
}: {
    visible: boolean;
    mounted: boolean;
    children: React.ReactNode;
}) {
    if (!mounted) return null;
    return (
        <View style={[styles.pane, !visible && styles.hidden]} pointerEvents={visible ? 'auto' : 'none'}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: color.canvas },
    body: { flex: 1 },
    pane: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
    hidden: { display: 'none' },
});
