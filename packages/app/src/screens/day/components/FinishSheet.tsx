/**
 * Asked when the doctor taps Finish: are the procedures on this visit right, or
 * do they need editing before the patient goes out to pay? The same two-answer
 * prompt as `BookNextSheet`, and for the same reason it is not a screen of its
 * own — the editor already exists, and this only decides whether to go through
 * it on the way to the desk.
 *
 * Edit procedures loads the visit before the sheet goes, so its button carries
 * the spinner and the sheet stays up until there is an editor to hand over to.
 * Finish without editing is the Finish the button made before this sheet
 * existed. The scrim and the hardware back are neither: the visit stays
 * unfinished and nothing is written, which is why they have a handler of their
 * own rather than sharing either answer's.
 *
 * A clinic that does not want the question turns it off in Settings →
 * Appointments, and Finish goes straight to the desk again.
 */
import { Button, Sheet } from '../../../components/ui';

export type FinishSheetProps = {
    visible: boolean;
    patientName: string;
    /** The visit is being loaded for the editor. */
    loading: boolean;
    /** Into the procedure editor; saving there is what sends them to the desk. */
    onEdit: () => void;
    /** Finish as it stands: the procedures are left as they are. */
    onFinish: () => void;
    /** The scrim and the hardware back: the sheet closes and the visit stays open. */
    onClose: () => void;
    /** See `Sheet`'s `onClosed` — the editor waits for the sheet to leave. */
    onClosed: () => void;
};

export function FinishSheet({
    visible,
    patientName,
    loading,
    onEdit,
    onFinish,
    onClose,
    onClosed,
}: FinishSheetProps) {
    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            onClosed={onClosed}
            // Held while the visit loads, so a dismissal cannot land between the
            // tap and the editor it has already asked for.
            dismissable={!loading}
            title="Edit the procedures first?"
            subtitle={patientName}
            testID="finish-sheet"
            footer={
                <>
                    <Button
                        label="Edit procedures"
                        block
                        loading={loading}
                        onPress={onEdit}
                        testID="finish-edit"
                    />
                    <Button
                        label="Finish without editing"
                        variant="text"
                        block
                        disabled={loading}
                        onPress={onFinish}
                        testID="finish-skip"
                    />
                </>
            }
        />
    );
}
