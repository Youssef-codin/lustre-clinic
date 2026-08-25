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
// `onOpenRecord` is the cross-cluster route the shell owns. A debtor row still
// opens the balance screen — that pane is the only way to a `RecordPayment`
// against an old visit, and sending the row to the record instead would orphan
// the flow the tab exists for. The record gets its own affordance one level in.
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

export type MoneyClusterProps = {
    onOpenRecord?: (patientId: string) => void;
};

export function MoneyCluster({ onOpenRecord }: MoneyClusterProps) {
    const [route, setRoute] = useState<Route>({ name: 'dashboard' });

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
