import type { ClientRole } from '@lustre/shared';
import { useEffect, useState } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { useConnection } from '../api';
import { BottomTabBar, type TabKey } from '../components/domain';
import { Toast } from '../components/ui';
import { DayScreen, DoctorDayScreen, type OpenBookingRequest } from '../screens/day';
import { MoneyCluster, type OpenPatientBalanceRequest } from '../screens/money';
import { type OpenRecordRequest, PatientsCluster } from '../screens/patients';
import { SettingsScreen } from '../screens/settings';
import { color } from '../theme';
import { OfflineScreen } from './OfflineScreen';
import {
    ALL_TABS,
    ask,
    type BookingTiming,
    bumpHome,
    type HomeSignals,
    NO_HOME,
    nextRoute,
    type PatientTarget,
    type ShellRoute,
} from './routes';

// The app shell (SPEC §18 F3): four clusters under one `domain/BottomTabBar`,
// each keeping its own internal stack. A tab is mounted on first open and then
// stays mounted, hidden with `display: 'none'` rather than unmounted, so the
// secretary keeps the date, scroll position and in-flight queries across tab
// switches. The shell owns the role — it outlives the settings screen — but it
// is still device-local and gates rows, never access.
//
// It also owns every route that crosses clusters, because a cluster holds its
// own stack and cannot push into another one's. A patient's record is the
// oldest of them: wherever it is asked for — a row in the list, an appointment
// in the doctor's day view — it opens on the Patients tab and the tab bar moves
// with it, because that is the screen's home and a record drawn inside the Day
// tab left the highlight on a day nobody was looking at. The patient record's
// three openers go the other way, into the day and money clusters. All of them
// travel as requests (`shell/routes.ts`) and the destination decides which of
// its screens that means.
//
// And it owns going home: tapping the tab you are already on pops that cluster
// back to its root. The shell cannot pop one from outside, so it bumps that
// tab's counter and the cluster resets itself.
//
// Disconnected is the shell's other route (`ShellRoute`), not an overlay and
// not something each screen answers for itself. The panes stay mounted behind
// it, hidden the same way a tab that is not up is hidden, which is what lets
// the reconnect put her back on the day she was reading with her scroll and her
// caches intact — but nothing of them is drawn or tappable, because a search
// field over a server that cannot be searched is worse than no screen at all.
export function AppShell() {
    const [tab, setTab] = useState<TabKey>('day');
    const [role, setRole] = useState<ClientRole>('doctor');
    const [visited, setVisited] = useState<TabKey[]>(['day']);
    // The day tab can be showing a booking, which is patients' work — the tab
    // bar says so rather than leaving the highlight on a day nobody is looking
    // at. Tapping a tab drops the highlight back where the tap says.
    const [booking, setBooking] = useState(false);
    // The request, not the route: the cluster below owns which of its screens is
    // up. `seq` makes each ask distinct, so the same patient can be opened again
    // after the record has been backed out of. One per destination — a booking
    // pushed into the day tab must not disturb the record the patients tab is
    // already holding.
    const [record, setRecord] = useState<OpenRecordRequest | undefined>(undefined);
    const [booked, setBooked] = useState<OpenBookingRequest | undefined>(undefined);
    const [balance, setBalance] = useState<OpenPatientBalanceRequest | undefined>(undefined);
    // Tapping the tab you are already on. One counter per tab, bumped up here
    // and read down there, because only the cluster knows what its home is.
    const [home, setHome] = useState<HomeSignals>(NO_HOME);
    // A toast for something that happened on one tab and finishes on another.
    // A cluster's own toast draws inside its pane, and the pane is hidden the
    // moment the route lands somewhere else — so a check-in that ends on the
    // patient's record has to report itself from up here.
    const [toast, setToast] = useState<string | null>(null);

    // Entered on the connection's word rather than on a query failing, so the
    // drop is answered wherever she is standing and not by whichever screen
    // happens to make the next request. `nextRoute` holds which statuses count.
    const { status } = useConnection();
    const [route, setRoute] = useState<ShellRoute>('app');
    const wanted = nextRoute(route, status);
    if (wanted !== route) setRoute(wanted);
    const disconnected = route === 'offline';

    // A pane nobody has opened has no components, so it has no queries either
    // and the round trip for Patients, Money or Settings started at the tap —
    // which is the pause. Mounting the other three once the day tab has settled
    // moves that cost to a moment when she is reading rather than waiting;
    // `runAfterInteractions` is what keeps it off the first paint. A tab tapped
    // before this lands still mounts on demand through `reveal`.
    useEffect(() => {
        const warm = InteractionManager.runAfterInteractions(() => setVisited([...ALL_TABS]));
        return () => warm.cancel();
    }, []);

    // Bringing a tab forward, without saying anything about the highlight — a
    // cross-cluster push answers that for itself, and the tab bar's own handler
    // answers it below.
    function reveal(next: TabKey) {
        setTab(next);
        setVisited((current) => (current.includes(next) ? current : [...current, next]));
    }

    /**
     * The tab bar. A tap on the tab already showing is not a switch — it is
     * "take me back to the top of this tab", and the cluster is the only thing
     * that can do it.
     *
     * Measured against the tab actually up, not the one lit: while the day tab
     * shows a booking the highlight sits on Patients, and a tap there is a real
     * move to Patients rather than a reset of a tab nobody is on. A tap on Day
     * in that state closes the booking, which is what the highlight moving back
     * says it did.
     */
    function open(next: TabKey) {
        // Either way the booking page is not what the highlight is about
        // afterwards: a tap on Day sends the day cluster home, which closes it,
        // and a tap anywhere else leaves it behind.
        setBooking(false);
        if (next === tab) {
            setHome((current) => bumpHome(current, next));
            return;
        }
        reveal(next);
    }

    function openRecord(patientId: string, backLabel?: string, said?: string) {
        setRecord((current) => ask(current, { patientId, backLabel }));
        reveal('patients');
        setBooking(false);
        if (said) setToast(said);
    }

    /**
     * The record's two openers. Both are one screen in the day cluster —
     * `BookingScreen`, where a walk-in is the "now" answer to when — so they
     * differ only in which answer it opens on.
     *
     * The highlight stays on Patients: the booking page covers the day pane, and
     * a booking belongs to the patient it is for. That is the same rule the day
     * tab's own FAB already follows, said here because the shell is what put the
     * page up.
     */
    function openBooking(patient: PatientTarget, timing: BookingTiming) {
        setBooked((current) => ask(current, { patient, timing }));
        reveal('day');
        setBooking(true);
    }

    /**
     * Settling a balance. The record's strip knows a patient-level total that
     * can span several unsettled visits, and a payment is taken against one
     * visit — so this lands on that patient's balances, which is the list the
     * total is made of, and the visit is chosen there. It is what the Money tab
     * already does from its own debtor rows; the record joins it rather than
     * growing a second way to take a payment.
     */
    function openBalance(patient: PatientTarget) {
        setBalance((current) => ask(current, { patientId: patient.id, patientName: patient.name }));
        reveal('money');
        setBooking(false);
    }

    return (
        <View style={styles.root}>
            <View style={styles.body}>
                <Pane visible={!disconnected && tab === 'day'} mounted={visited.includes('day')}>
                    {role === 'doctor' ? (
                        <DoctorDayScreen
                            key="doctor"
                            goHome={home.day}
                            onOpenRecord={(patientId) => openRecord(patientId, 'Day')}
                        />
                    ) : (
                        <DayScreen
                            key="secretary"
                            open={booked}
                            goHome={home.day}
                            onBookingChange={setBooking}
                            onOpenRecord={(patientId, said) => openRecord(patientId, 'Day', said)}
                        />
                    )}
                </Pane>

                <Pane visible={!disconnected && tab === 'patients'} mounted={visited.includes('patients')}>
                    <PatientsCluster
                        open={record}
                        goHome={home.patients}
                        // Booking is the desk's, and the doctor's day view has no
                        // booking on it to reach — so on his phone the record's
                        // two openers keep the screen's own fallback, which says
                        // where the flow lives instead of failing silently.
                        onBook={role === 'secretary' ? (patient) => openBooking(patient, 'later') : undefined}
                        onWalkIn={role === 'secretary' ? (patient) => openBooking(patient, 'now') : undefined}
                        onRecordPayment={openBalance}
                    />
                </Pane>

                <Pane visible={!disconnected && tab === 'money'} mounted={visited.includes('money')}>
                    <MoneyCluster open={balance} goHome={home.money} />
                </Pane>

                <Pane visible={!disconnected && tab === 'settings'} mounted={visited.includes('settings')}>
                    <SettingsScreen role={role} goHome={home.settings} onChangeRole={setRole} />
                </Pane>

                {/* Inside the body rather than at the root, so it rides above
                    the tab bar on the default offset — the same place a
                    cluster's own toast lands, since the panes end here too.
                    It has nothing to say on the disconnected route: what it
                    reports happened on a tab, and no tab is up. */}
                <Toast
                    visible={!disconnected && toast !== null}
                    message={toast ?? ''}
                    onDismiss={() => setToast(null)}
                    testID="shell-toast"
                />

                {/* The route, in the panes' place rather than over them: they
                    are hidden above, so this is the only thing in the body. */}
                {disconnected ? <OfflineScreen /> : null}
            </View>

            {/* No tab bar on the disconnected route either. It is a dead end,
                not a mode to navigate around, and every tab it offers leads to
                the same screen. */}
            {disconnected ? null : (
                <BottomTabBar
                    active={booking && tab === 'day' ? 'patients' : tab}
                    role={role}
                    onChange={open}
                />
            )}
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
});
