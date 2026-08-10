import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PushView } from '../../components/ui';
import { color } from '../../theme';
import { MoneyScreen } from './MoneyScreen';
import { PatientBalanceScreen } from './PatientBalanceScreen';
import { VisitPaymentsScreen } from './VisitPaymentsScreen';

// Money → patient balances → payment history. Three panes on `ui/PushView`,
// because there is no navigator yet (BLOCKED.md #4). Each screen already takes
// its ids and its `onBack` as props, so they drop onto a real stack unchanged
// when F3 lands.
//
// `version` is the cluster's cache invalidation. A payment recorded three panes
// deep changes the dashboard's collection rate, its takings and its outstanding
// total, and the honest way to reflect that is to ask the server again — not to
// adjust a figure on the way back up.

type Route =
    | { name: 'dashboard' }
    | { name: 'patient'; patientId: string; patientName: string }
    | { name: 'visit'; visitId: string; patientId: string; patientName: string };

export function MoneyCluster() {
    const [route, setRoute] = useState<Route>({ name: 'dashboard' });
    const [version, setVersion] = useState(0);

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
                        onOpenVisit={(visitId) =>
                            setRoute({
                                name: 'visit',
                                visitId,
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
