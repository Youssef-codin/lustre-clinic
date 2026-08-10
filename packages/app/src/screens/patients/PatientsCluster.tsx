import { useState } from 'react';
import { PatientListScreen } from './PatientListScreen';
import { PatientRecordScreen } from './PatientRecordScreen';

/**
 * The Patients cluster's own root — list ⇄ record.
 *
 * `_Local` in spirit per §10: there is no navigator. SPEC §18 F3 has not
 * landed, `expo-router`/React Navigation is not an app dependency, and adding
 * one means editing `package.json` and the lockfile in four worktrees at once.
 * Noted in `BLOCKED.md`.
 *
 * So this holds one piece of state — which of the cluster's two screens is on
 * top — and hands it down. When the navigator lands, this file becomes a stack
 * with the same two routes and the same two props, and both screens are already
 * written against exactly that: `onOpen(patientId)` and `onBack()`.
 *
 * The shell (`src/shell`) mounts this as the Patients tab.
 */

type Route = { name: 'list' } | { name: 'record'; patientId: string };

export function PatientsCluster() {
    const [route, setRoute] = useState<Route>({ name: 'list' });

    if (route.name === 'record') {
        return <PatientRecordScreen patientId={route.patientId} onBack={() => setRoute({ name: 'list' })} />;
    }

    return <PatientListScreen onOpen={(patientId) => setRoute({ name: 'record', patientId })} />;
}
