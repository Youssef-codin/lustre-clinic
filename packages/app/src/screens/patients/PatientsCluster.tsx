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
// The traffic runs the other way too: the record's Book, Walk-in and Record
// payment all land in a cluster this one cannot reach, so they are handed back
// up to the shell with the patient and nothing else. `goHome` comes down the
// same wire — the shell cannot pop a route it does not own, so it says only
// that the tab was tapped and this decides that home is the list.
//
// The editor is reachable from both screens and returns to whichever asked for
// it, which is the one thing a two-route union could not express: `from` is the
// route Cancel goes back to. Saving does not go back — registering someone lands
// on the record that now exists, and correcting one lands on the record with the
// correction on it, which is `read` bumped so the screen remounts and re-reads
// rather than showing what it was holding before the write.
import { useState } from 'react';
import { PushView } from '../../components/ui';
import type { PatientTarget } from '../../shell/routes';
import { VisitPage } from '../day';
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
    /**
     * Bumped by the shell when the Patients tab is tapped while it is already
     * up. Home here is the list with its search field, which is the one thing
     * the shell could not decide for itself.
     */
    goHome?: number;
    /**
     * The record's three openers, which all land in another cluster — booking
     * and the walk-in in the day view, settling a balance in money. The shell
     * owns those routes (`shell/routes.ts`); this passes the patient up and
     * nothing more. Absent leaves the record screen's own fallback in place,
     * which names where the flow lives rather than failing silently.
     */
    onBook?: (patient: PatientTarget) => void;
    onWalkIn?: (patient: PatientTarget) => void;
    onRecordPayment?: (patient: PatientTarget) => void;
};

export function PatientsCluster({
    open,
    goHome = 0,
    onBook,
    onWalkIn,
    onRecordPayment,
}: PatientsClusterProps) {
    const [route, setRoute] = useState<Route>({ name: 'list' });
    const [seen, setSeen] = useState(0);
    const [seenHome, setSeenHome] = useState(goHome);
    /** The editor, mid-write. A tab tap must not take the screen out from under it. */
    const [saving, setSaving] = useState(false);
    /** Bumped by a save, so the record behind the editor remounts onto fresh data. */
    const [read, setRead] = useState(0);
    // A visit opened off a history row. It is a page over the record rather
    // than a fourth route, because backing out of it returns to the row you
    // tapped with the record's scroll where you left it. `VisitPage` is the day
    // cluster's whole visit stack behind two ids — see `screens/day/index.ts`.
    const [visit, setVisit] = useState<{ appointmentId: string; visitId: string } | null>(null);
    const [visitOpen, setVisitOpen] = useState(false);

    // Derived during render rather than in an effect: the record is on screen in
    // the same commit as the tab switch, so the pane does not paint the list for
    // a frame first.
    if (open && open.seq !== seen) {
        setSeen(open.seq);
        setRoute({ name: 'record', patientId: open.patientId, backLabel: open.backLabel });
    }

    // The tap is spent either way: a save in flight swallows it rather than
    // queueing it, the same way the editor drops Cancel instead of greying it.
    if (goHome !== seenHome) {
        setSeenHome(goHome);
        if (!saving) {
            setRoute({ name: 'list' });
            setVisitOpen(false);
        }
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
                onSavingChange={setSaving}
                onSaved={(patientId) => {
                    setRead((n) => n + 1);
                    setRoute({ name: 'record', patientId });
                }}
            />
        );
    }

    if (route.name === 'record') {
        return (
            <>
                <PatientRecordScreen
                    key={`record:${route.patientId}:${read}`}
                    patientId={route.patientId}
                    backLabel={route.backLabel}
                    onBack={() => setRoute({ name: 'list' })}
                    onEdit={() => setRoute({ name: 'edit', patientId: route.patientId, from: 'record' })}
                    onBook={onBook}
                    onWalkIn={onWalkIn}
                    onRecordPayment={onRecordPayment}
                    onOpenVisit={(entry) => {
                        if (!entry.visitId) return;
                        setVisit({ appointmentId: entry.appointmentId, visitId: entry.visitId });
                        setVisitOpen(true);
                    }}
                />

                <PushView visible={visitOpen} testID="patient-visit-page">
                    {visit ? (
                        <VisitPage
                            key={`visit:${visit.visitId}`}
                            appointmentId={visit.appointmentId}
                            visitId={visit.visitId}
                            onClose={() => setVisitOpen(false)}
                            // The record's totals move with the visit, so it is
                            // re-read rather than left showing what it held.
                            onChanged={() => setRead((n) => n + 1)}
                        />
                    ) : null}
                </PushView>
            </>
        );
    }

    return (
        <PatientListScreen
            goHome={goHome}
            onOpen={(patientId) => setRoute({ name: 'record', patientId })}
            onNewPatient={() => setRoute({ name: 'edit', from: 'list' })}
        />
    );
}
