// Choosing a procedure, and the tooth it was done on when §5 says it needs one.
//
// Two places in this cluster ask that question — the previous-procedures list
// on the editor, and the old-visit sheet on the record — and they must not
// drift, so the asking lives here and the callers only receive the answer.
// What differs between them is what they do with it: one keeps a dated line
// with no money on it, the other keeps a priced line on a visit.
//
// The catalogue sheet and the tooth sheet are the day cluster's, reused rather
// than redrawn: a procedure the doctor may record is exactly a procedure that
// may be recorded late, and a second catalogue would be a second thing to keep
// in step with §5. They are driven by the day cluster's own query hook for one
// reason — `ProcedureSheet` takes a `RequestError` and that hook is what
// produces one.
import type { Tooth } from '@lustre/shared';
import { useState } from 'react';
import { duration } from '../../../components/ui';
import { type PickedProcedure, ProcedureSheet } from '../../day/components/ProcedureSheet';
import { ToothSheet } from '../../day/components/ToothSheet';
import { api as dayApi, useLocalQuery } from '../../day/data';

/** What a completed pick is: the catalogue row, how it reads, and the tooth if it needed one. */
export type ProcedurePick = {
    procedureId: string;
    /** As it is read out: "Composite filling — Class II". Display only; the id is what is sent. */
    name: string;
    tooth: Tooth | null;
    /** The catalogue's price in piastres, which a priced caller uses as its default. */
    defaultPrice: number;
    isCheckup: boolean;
};

export type ProcedurePickerProps = {
    /** The catalogue sheet is open. A tooth question may outlive it — see `pick`. */
    visible: boolean;
    onPicked: (pick: ProcedurePick) => void;
    onClose: () => void;
};

type Asking = null | { step: 'procedure' } | { step: 'toothFor'; picked: PickedProcedure };

export function ProcedurePicker({ visible, onPicked, onClose }: ProcedurePickerProps) {
    const [asking, setAsking] = useState<Asking>(null);

    // Not until the caller opens it. Both callers draw their list on a screen
    // that is usually opened to do something else, so a tree fetched on mount
    // is a request over Tailscale for a sheet nobody is going to open.
    const catalogue = useLocalQuery('patients:procedureTree', () => dayApi.procedureTree(), {
        enabled: visible || asking !== null,
    });

    /**
     * The sheet offers the whole catalogue, so a pick can arrive owing a tooth.
     * Ask for it before the line exists — §5 refuses the line without one, and
     * a line the save then throws away is worse than a second question. Both
     * sheets are `Modal`s, so the second waits out the first's exit rather than
     * racing it into the silent drop iOS does otherwise.
     */
    function pick(picked: PickedProcedure) {
        if (picked.needsTooth) {
            onClose();
            setTimeout(() => setAsking({ step: 'toothFor', picked }), duration.sheet);
            return;
        }
        report(picked, null);
    }

    function report(picked: PickedProcedure, tooth: Tooth | null) {
        onPicked({
            procedureId: picked.procedureId,
            name: picked.variant ? `${picked.name} — ${picked.variant}` : picked.name,
            tooth,
            defaultPrice: picked.price,
            isCheckup: picked.isCheckup,
        });
        setAsking(null);
    }

    return (
        <>
            <ProcedureSheet
                visible={visible}
                onClose={onClose}
                onPick={pick}
                categories={catalogue.data ?? []}
                loading={catalogue.status === 'loading'}
                error={catalogue.error}
                onRetry={catalogue.refetch}
                tooth={null}
            />

            <ToothSheet
                visible={asking?.step === 'toothFor'}
                // The variant is what was tapped; the category alone reads as
                // "Surgical is done to a tooth", which names nothing.
                required={
                    asking?.step === 'toothFor' ? (asking.picked.variant ?? asking.picked.name) : undefined
                }
                onClose={() => setAsking(null)}
                onPick={(tooth) => {
                    if (asking?.step === 'toothFor') report(asking.picked, tooth);
                }}
            />
        </>
    );
}
