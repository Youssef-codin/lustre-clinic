// The Patients cluster's own root — list ⇄ record. There is no navigator yet
// (SPEC §18 F3), so this holds which of the two screens is on top and hands it
// down; when a navigator lands this becomes a stack with the same two routes,
// and both screens are already written against `onOpen(patientId)` and
// `onBack()`. The shell (`src/shell`) mounts this as the Patients tab.
import { useState } from 'react';
import { PatientListScreen } from './PatientListScreen';
import { PatientRecordScreen } from './PatientRecordScreen';

type Route = { name: 'list' } | { name: 'record'; patientId: string };

export function PatientsCluster() {
    const [route, setRoute] = useState<Route>({ name: 'list' });

    if (route.name === 'record') {
        return <PatientRecordScreen patientId={route.patientId} onBack={() => setRoute({ name: 'list' })} />;
    }

    return <PatientListScreen onOpen={(patientId) => setRoute({ name: 'record', patientId })} />;
}
