import type { ClientRole } from '@lustre/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useConnection } from '../api';
import { BottomTabBar, type TabKey } from '../components/domain';
import { DayScreen, DoctorDayScreen } from '../screens/day';
import { MoneyCluster } from '../screens/money';
import { PatientsCluster } from '../screens/patients';
import { SettingsScreen } from '../screens/settings';
import { color } from '../theme';
import { OfflineScreen } from './OfflineScreen';

// The app shell (SPEC §18 F3): four clusters under one `domain/BottomTabBar`,
// each keeping its own internal stack. A tab is mounted on first open and then
// stays mounted, hidden with `display: 'none'` rather than unmounted, so the
// secretary keeps the date, scroll position and in-flight queries across tab
// switches. The shell owns the role — it outlives the settings screen — but it
// is still device-local and gates rows, never access.
export function AppShell() {
    const [tab, setTab] = useState<TabKey>('day');
    const [role, setRole] = useState<ClientRole>('doctor');
    const [visited, setVisited] = useState<TabKey[]>(['day']);
    // The day tab can be showing a booking, which is patients' work — the tab
    // bar says so rather than leaving the highlight on a day nobody is looking
    // at. Tapping a tab drops the highlight back where the tap says.
    const [booking, setBooking] = useState(false);
    const { isOffline, isOnline } = useConnection();

    // Sticky: `reprobe` passes through 'probing' on its way to an answer, and
    // reading `isOffline` directly would drop the overlay for those few hundred
    // milliseconds and flash the stale app underneath. Once it is up it only
    // comes down on a confirmed 'online'.
    const [showOffline, setShowOffline] = useState(false);
    if (isOffline && !showOffline) setShowOffline(true);
    if (isOnline && showOffline) setShowOffline(false);

    function open(next: TabKey) {
        // Testing shortcut: the role tab flips doctor/secretary in place instead
        // of opening settings, so both day views are one tap apart.
        if (next === 'role') {
            setRole((current) => (current === 'doctor' ? 'secretary' : 'doctor'));
            return;
        }
        setTab(next);
        setBooking(false);
        setVisited((current) => (current.includes(next) ? current : [...current, next]));
    }

    return (
        <View style={styles.root}>
            <View style={styles.body}>
                <Pane visible={tab === 'day'} mounted={visited.includes('day')}>
                    {role === 'doctor' ? (
                        <DoctorDayScreen key="doctor" />
                    ) : (
                        <DayScreen key="secretary" onBookingChange={setBooking} />
                    )}
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

            <BottomTabBar active={booking && tab === 'day' ? 'patients' : tab} role={role} onChange={open} />

            {/* Covers the tab bar too: offline is a dead end, not a mode you
                can navigate around. The clusters stay mounted underneath so
                the date, scroll and caches survive a reconnect. */}
            {showOffline ? (
                <View style={styles.offline}>
                    <OfflineScreen />
                </View>
            ) : null}
        </View>
    );
}

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
    offline: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: color.canvas },
});
