// Money → patient balances → payment history, three panes on `ui/PushView`
// because there is no navigator yet (BLOCKED.md #4); each screen takes its ids
// and `onBack` as props, so they drop onto a real stack unchanged. `version` is
// the cluster's cache invalidation — a payment three panes deep changes the
// dashboard's figures, and the honest fix is to ask the server again. The visit
// route carries `visitRef`/`startsAt` because `visit.byId` returns neither
// (BLOCKED.md #14).
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
};

export function MoneyCluster({ open, goHome = 0 }: MoneyClusterProps = {}) {
    const [route, setRoute] = useState<Route>({ name: 'dashboard' });
    const [version, setVersion] = useState(0);
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
                version={version}
                onOpenPatient={(patientId, patientName) =>
                    setRoute({ name: 'patient', patientId, patientName })
                }
            />

            <PushView visible={patient !== null}>
                {patient ? (
                    <PatientBalanceScreen
                        patientId={patient.patientId}
                        patientName={patient.patientName}
                        version={version}
                        onBack={() => setRoute({ name: 'dashboard' })}
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
                        version={version}
                        onBack={() =>
                            setRoute({
                                name: 'patient',
                                patientId: route.patientId,
                                patientName: route.patientName,
                            })
                        }
                        onPaymentRecorded={() => setVersion((value) => value + 1)}
                    />
                ) : null}
            </PushView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: color.canvas },
});
