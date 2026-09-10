/**
 * The first question of a booking, and the only one asked in a sheet: who is
 * it for. Search wants a keyboard and a short list of answers, which is what a
 * bottom sheet is for; everything after it — the day, the time, how long —
 * wants the whole screen, so answering this pushes `BookingScreen` and the
 * sheet gets out of the way.
 *
 * It carries no mutation of its own. Nothing is written until the page's Book
 * button, so dismissing this costs nothing and there is no in-flight state to
 * protect — but `onRegisterNew` leads to `PatientEditScreen`, which does write,
 * and a patient registered through it exists whether or not the booking that
 * sent them there is ever finished.
 */
import { useState } from 'react';
import { Button, Sheet } from '../../../components/ui';
import { EMPTY_PATIENT_DRAFT, type PatientDraft, patientRefOf } from '../patientDraft';
import { PatientPicker } from './PatientPicker';

export type BookPatientSheetProps = {
    visible: boolean;
    onClose: () => void;
    onPicked: (draft: PatientDraft) => void;
    /**
     * Nobody on file matches, so go and make the record. The sheet is dismissed
     * on the way — the editor is a full page and this would otherwise be left
     * open underneath it — and what was typed into the search is not kept, which
     * is why this is a different callback from `onPicked` rather than a mode.
     */
    onRegisterNew: () => void;
};

export function BookPatientSheet({ visible, onClose, onPicked, onRegisterNew }: BookPatientSheetProps) {
    const [draft, setDraft] = useState<PatientDraft>(EMPTY_PATIENT_DRAFT);

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title="Who is it for?"
            subtitle="Search the patients on file, or register someone new."
            testID="book-patient-sheet"
            footer={
                <Button
                    label="Continue"
                    block
                    disabled={patientRefOf(draft) === null}
                    onPress={() => onPicked(draft)}
                    testID="book-continue"
                />
            }
        >
            <PatientPicker value={draft} onChange={setDraft} active={visible} onRegisterNew={onRegisterNew} />
        </Sheet>
    );
}
