// Money → patient balances → payment history, three panes on `ui/PushView`
// because there is no navigator yet; each screen takes its ids and `onBack` as
// props, so they drop onto a real stack unchanged. The visit route carries
// `visitRef`/`startsAt` because `visit.byId` joins neither the appointment nor
// the patient.
//
// There is no `version` any more. The cluster used to bump a counter after a
// payment so every stub query re-keyed on it; the real client has a query
// cache, and `useRecordPayment` invalidates `balance` and `visit` instead.
//
// Two cross-cluster routes meet on the balance screen, both owned by the shell
// and pointing opposite ways. `open` arrives from the patient record's Record
// payment; `onOpenRecord` is the way back, a link on that same screen. Between
// them the record and the balances are reachable from each other, which is what
// lets the debtor row keep its own destination: it still opens the balances,
// because that pane is the only way to a `RecordPayment` against an old visit,
// and sending the row to the record instead would orphan the flow the tab
// exists for.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PushView } from '../../components/ui';
import { color } from '../../theme';
import { MoneyScreen } from './MoneyScreen';
import { PatientBalanceScreen } from './PatientBalanceScreen';
import { VisitPaymentsScreen } from './VisitPaymentsScreen';

type Route =
    | { name: 'dashboard' }
    | { name: 'patient'; patientId: string; patientName: string }
    | {
          name: 'visit';
          visitId: string;
          visitRef: string;
          startsAt: string;
          patientId: string;
          patientName: string;
      };

/**
 * A patient's balances asked for from outside this cluster — the record's
 * Record payment, routed here by the shell. It lands on the balances rather
 * than on a payment form because the record's strip knows a patient-level
 * total that can span several unsettled visits, and a payment is taken against
 * one: the visit is chosen here, off the list the total is made of. The name
 * rides along because `visit.balances` does not return it.
 */
export type OpenPatientBalanceRequest = {
    patientId: string;
    patientName: string;
    /** Bumped per request so the same patient can be re-opened. */
    seq: number;
};

export type MoneyClusterProps = {
    open?: OpenPatientBalanceRequest;
    /** Bumped when the Money tab is tapped while it is already up. Home is the dashboard. */
    goHome?: number;
    /** The way back out: the balance screen's own link to the patient's record. */
    onOpenRecord?: (patientId: string) => void;
};

export function MoneyCluster({ open, goHome = 0, onOpenRecord }: MoneyClusterProps = {}) {
    const [route, setRoute] = useState<Route>({ name: 'dashboard' });
    const [seen, setSeen] = useState(0);
    const [seenHome, setSeenHome] = useState(goHome);

    // Derived during render, so the pane does not paint the dashboard for a
    // frame before the patient's balances land on top of it.
    if (open && open.seq !== seen) {
        setSeen(open.seq);
        setRoute({ name: 'patient', patientId: open.patientId, patientName: open.patientName });
    }

    if (goHome !== seenHome) {
        setSeenHome(goHome);
        setRoute({ name: 'dashboard' });
    }

    const patient = route.name === 'dashboard' ? null : route;

    return (
        <View style={styles.root}>
            <MoneyScreen
                // The pill is an overlay on the dashboard, and the dashboard
                // stays mounted under a pushed pane. Rendering a search for a
                // list that is not on screen is what put it over the balance
                // screen; not rendering it is not a z-order to get right.
                searchVisible={patient === null}
                onOpenPatient={(patientId, patientName) =>
                    setRoute({ name: 'patient', patientId, patientName })
                }
            />

            <PushView visible={patient !== null}>
                {patient ? (
                    <PatientBalanceScreen
                        patientId={patient.patientId}
                        patientName={patient.patientName}
                        onBack={() => setRoute({ name: 'dashboard' })}
                        onOpenRecord={onOpenRecord && (() => onOpenRecord(patient.patientId))}
                        onOpenVisit={(visit) =>
                            setRoute({
                                name: 'visit',
                                visitId: visit.visitId,
                                visitRef: visit.ref,
                                startsAt: visit.startsAt,
                                patientId: patient.patientId,
                                patientName: patient.patientName,
                            })
                        }
                    />
                ) : null}
            </PushView>

            <PushView visible={route.name === 'visit'}>
                {route.name === 'visit' ? (
                    <VisitPaymentsScreen
                        visitId={route.visitId}
                        visitRef={route.visitRef}
                        startsAt={route.startsAt}
                        patientName={route.patientName}
                        onBack={() =>
                            setRoute({
                                name: 'patient',
                                patientId: route.patientId,
                                patientName: route.patientName,
                            })
                        }
                    />
                ) : null}
            </PushView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: color.canvas },
});
