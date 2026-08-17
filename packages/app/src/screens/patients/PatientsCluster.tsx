// The Patients cluster's own root — list ⇄ record ⇄ editor. There is no
// navigator yet (SPEC §18 F3), so this holds which of the three screens is on
// top and hands it down; when a navigator lands this becomes a stack with the
// same three routes, and every screen is already written against
// `onOpen(patientId)`, `onBack()` and `onSaved(patientId)`. The shell
// (`src/shell`) mounts this as the Patients tab.
//
// A record can also be asked for from outside — the doctor's day view opens one
// off an appointment — and a patient's record is the Patients tab's screen, so
// the shell switches tabs and passes the request down here rather than each
// cluster drawing its own copy inside its own tab. `open` is the request, not the
// route: it carries a `seq` so asking for the same patient twice re-opens the
// record after it has been backed out of, and `backLabel` says where back goes
// in the caller's words.
//
// The editor is reachable from both screens and returns to whichever asked for
// it, which is the one thing a two-route union could not express: `from` is the
// route Cancel goes back to. Saving does not go back — registering someone lands
// on the record that now exists, and correcting one lands on the record with the
// correction on it, which is `read` bumped so the screen remounts and re-reads
// rather than showing what it was holding before the write.
import { useState } from 'react';
import { PatientEditScreen } from './PatientEditScreen';
import { PatientListScreen } from './PatientListScreen';
import { PatientRecordScreen } from './PatientRecordScreen';

type Route =
    | { name: 'list' }
    | { name: 'record'; patientId: string; backLabel?: string }
    | { name: 'edit'; patientId?: string; from: 'list' | 'record' };

export type OpenRecordRequest = {
    patientId: string;
    /** Bumped per request so the same patient can be re-opened. */
    seq: number;
    backLabel?: string;
};

export type PatientsClusterProps = {
    open?: OpenRecordRequest;
};

export function PatientsCluster({ open }: PatientsClusterProps) {
    const [route, setRoute] = useState<Route>({ name: 'list' });
    const [seen, setSeen] = useState(0);
    /** Bumped by a save, so the record behind the editor remounts onto fresh data. */
    const [read, setRead] = useState(0);

    // Derived during render rather than in an effect: the record is on screen in
    // the same commit as the tab switch, so the pane does not paint the list for
    // a frame first.
    if (open && open.seq !== seen) {
        setSeen(open.seq);
        setRoute({ name: 'record', patientId: open.patientId, backLabel: open.backLabel });
    }

    if (route.name === 'edit') {
        const back = route.from;
        return (
            <PatientEditScreen
                key={`edit:${route.patientId ?? 'new'}`}
                patientId={route.patientId}
                onCancel={() =>
                    setRoute(
                        back === 'record' && route.patientId
                            ? { name: 'record', patientId: route.patientId }
                            : { name: 'list' },
                    )
                }
                onSaved={(patientId) => {
                    setRead((n) => n + 1);
                    setRoute({ name: 'record', patientId });
                }}
            />
        );
    }

    if (route.name === 'record') {
        return (
            <PatientRecordScreen
                key={`record:${route.patientId}:${read}`}
                patientId={route.patientId}
                backLabel={route.backLabel}
                onBack={() => setRoute({ name: 'list' })}
                onEdit={() => setRoute({ name: 'edit', patientId: route.patientId, from: 'record' })}
            />
        );
    }

    return (
        <PatientListScreen
            onOpen={(patientId) => setRoute({ name: 'record', patientId })}
            onNewPatient={() => setRoute({ name: 'edit', from: 'list' })}
        />
    );
}
