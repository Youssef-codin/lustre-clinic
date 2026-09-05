/**
 * Book the next visit, offered the moment a patient is checked in. Completing a
 * check-in used to go straight to their record, so booking the return meant
 * backing out and starting the booking flow from nothing, with the patient
 * standing there.
 *
 * A prompt, not a second booking screen. It asks one question and offers the two
 * answers to it: into the booking flow now, or not now. It used to carry a day
 * strip and a grid of times of its own — a slimmed-down copy of `BookingScreen`
 * — under a confirm button that spent most of its life disabled reading "Pick a
 * day and a time". That is two competing exits plus a dead control, with the
 * dead one the largest thing on the sheet, and it is a second booking flow that
 * would have drifted from the real one.
 *
 * What the sheet was for is kept: the patient carries across, so the search —
 * the expensive part, and the reason this exists at all — is still saved. What
 * is given up is a couple of taps on a screen the desk already knows, in
 * exchange for one booking flow instead of two. That trade was made deliberately
 * and should not be re-argued from the sheet's side.
 *
 * How long, what for, which branch, which day and what time all belong to
 * `BookingScreen`, and so does the double-booking refusal: it is the same
 * `appointment.create` either way, and that screen already lands the exclusion
 * constraint's answer above the button that caused it (§4/§14).
 *
 * Dismissing is the common case and costs nothing: the scrim, the hardware back
 * and Book later all land exactly where confirming an arrival landed before this
 * sheet existed. Nothing here writes, so nothing here can refuse to close.
 */
import { Button, Sheet } from '../../../components/ui';

export type BookNextSheetProps = {
    visible: boolean;
    /** Shown instead of a search box — this is the patient who is standing there. */
    patientName: string;
    /** Into `BookingScreen`, with this patient already answered. */
    onBookNow: () => void;
    /** Scrim, hardware back and Book later all arrive here. */
    onDismiss: () => void;
};

export function BookNextSheet({ visible, patientName, onBookNow, onDismiss }: BookNextSheetProps) {
    return (
        <Sheet
            visible={visible}
            onClose={onDismiss}
            title="Book their next visit?"
            subtitle={patientName}
            testID="book-next-sheet"
            footer={
                <>
                    <Button label="Book next now" block onPress={onBookNow} testID="book-next-now" />
                    <Button
                        label="Book later"
                        variant="text"
                        block
                        onPress={onDismiss}
                        testID="book-next-dismiss"
                    />
                </>
            }
        />
    );
}
