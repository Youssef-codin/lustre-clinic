/**
 * The first question of a booking, and the only one asked in a sheet: who is
 * it for. Search wants a keyboard and a short list of answers, which is what a
 * bottom sheet is for; everything after it — the day, the time, how long —
 * wants the whole screen, so answering this pushes `BookingScreen` and the
 * sheet gets out of the way.
 *
 * It carries no mutation. Nothing is written until the page's Book button, so
 * dismissing this costs nothing and there is no in-flight state to protect.
 */
import { useState } from 'react';
import { Button, Sheet } from '../../../components/ui';
import { EMPTY_PATIENT_DRAFT, type PatientDraft, PatientPicker, patientRefOf } from './PatientPicker';

export type BookPatientSheetProps = {
    visible: boolean;
    onClose: () => void;
    onPicked: (draft: PatientDraft) => void;
};

export function BookPatientSheet({ visible, onClose, onPicked }: BookPatientSheetProps) {
    const [draft, setDraft] = useState<PatientDraft>(EMPTY_PATIENT_DRAFT);

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title="Who is it for?"
            subtitle="Someone on file, or a patient who is new here."
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
            <PatientPicker value={draft} onChange={setDraft} active={visible} />
        </Sheet>
    );
}
