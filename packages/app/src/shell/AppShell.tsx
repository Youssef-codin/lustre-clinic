import type { ClientRole } from '@lustre/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useConnection } from '../api';
import { BottomTabBar, type TabKey } from '../components/domain';
import { Toast } from '../components/ui';
import { DayScreen, DoctorDayScreen } from '../screens/day';
import { MoneyCluster } from '../screens/money';
import { type OpenRecordRequest, PatientsCluster } from '../screens/patients';
import { SettingsScreen } from '../screens/settings';
import { color } from '../theme';
import { OfflineScreen } from './OfflineScreen';

// The app shell (SPEC §18 F3): four clusters under one `domain/BottomTabBar`,
// each keeping its own internal stack. A tab is mounted on first open and then
// stays mounted, hidden with `display: 'none'` rather than unmounted, so the
// secretary keeps the date, scroll position and in-flight queries across tab
// switches. The shell owns the role — it outlives the settings screen — but it
// is still device-local and gates rows, never access.
//
// It also owns the one route that crosses clusters: a patient's record. Wherever
// it is asked for — a row in the list, an appointment in the doctor's day view —
// it opens on the Patients tab and the tab bar moves with it, because that is
// the screen's home and a record drawn inside the Day tab left the highlight on
// a day nobody was looking at.
export function AppShell() {
    const [tab, setTab] = useState<TabKey>('day');
    const [role, setRole] = useState<ClientRole>('doctor');
    const [visited, setVisited] = useState<TabKey[]>(['day']);
    // The day tab can be showing a booking, which is patients' work — the tab
    // bar says so rather than leaving the highlight on a day nobody is looking
    // at. Tapping a tab drops the highlight back where the tap says.
    const [booking, setBooking] = useState(false);
    // The request, not the route: the cluster below owns which of its two
    // screens is up. `seq` makes each ask distinct, so the same patient can be
    // opened again after the record has been backed out of.
    const [record, setRecord] = useState<OpenRecordRequest | undefined>(undefined);
    // A toast for something that happened on one tab and finishes on another.
    // A cluster's own toast draws inside its pane, and the pane is hidden the
    // moment the route lands somewhere else — so a check-in that ends on the
    // patient's record has to report itself from up here.
    const [toast, setToast] = useState<string | null>(null);
    const { isOffline, isOnline } = useConnection();

    // Sticky: `reprobe` passes through 'probing' on its way to an answer, and
    // reading `isOffline` directly would drop the overlay for those few hundred
    // milliseconds and flash the stale app underneath. Once it is up it only
    // comes down on a confirmed 'online'.
    const [showOffline, setShowOffline] = useState(false);
    if (isOffline && !showOffline) setShowOffline(true);
    if (isOnline && showOffline) setShowOffline(false);

    function open(next: TabKey) {
        setTab(next);
        setBooking(false);
        setVisited((current) => (current.includes(next) ? current : [...current, next]));
    }

    function openRecord(patientId: string, backLabel?: string, said?: string) {
        setRecord((current) => ({ patientId, backLabel, seq: (current?.seq ?? 0) + 1 }));
        open('patients');
        if (said) setToast(said);
    }

    return (
        <View style={styles.root}>
            <View style={styles.body}>
                <Pane visible={tab === 'day'} mounted={visited.includes('day')}>
                    {role === 'doctor' ? (
                        <DoctorDayScreen
                            key="doctor"
                            onOpenRecord={(patientId) => openRecord(patientId, 'Day')}
                        />
                    ) : (
                        <DayScreen
                            key="secretary"
                            onBookingChange={setBooking}
                            onOpenRecord={(patientId, said, backLabel) =>
                                openRecord(patientId, backLabel ?? 'Day', said)
                            }
                        />
                    )}
                </Pane>

                <Pane visible={tab === 'patients'} mounted={visited.includes('patients')}>
                    <PatientsCluster open={record} />
                </Pane>

                <Pane visible={tab === 'money'} mounted={visited.includes('money')}>
                    <MoneyCluster />
                </Pane>

                <Pane visible={tab === 'settings'} mounted={visited.includes('settings')}>
                    <SettingsScreen role={role} onChangeRole={setRole} />
                </Pane>

                {/* Inside the body rather than at the root, so it rides above
                    the tab bar on the default offset — the same place a
                    cluster's own toast lands, since the panes end here too. */}
                <Toast
                    visible={toast !== null}
                    message={toast ?? ''}
                    onDismiss={() => setToast(null)}
                    testID="shell-toast"
                />
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
