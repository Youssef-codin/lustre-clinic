// The patient's own notes — `patients.notes`, and not a visit's or an
// appointment's. Those are written on the visit and the booking and stay there;
// this is the one free-text field that belongs to the person, the thing the
// desk wants to know before the file is opened ("prefers mornings", "brother
// of 4121").
//
// Written from the record only. The editor never sends it, so a correction to
// someone's phone number cannot put their notes back to what the form loaded.
// The sheet follows `RecordPaymentSheet`'s rules: opening is what resets the
// draft, a failure keeps what was typed, and it refuses to dismiss mid-write.
import { useState } from 'react';
import { Button, Callout, Sheet, Textarea } from '../../../components/ui';
import { useT } from '../../../i18n';
import { Text } from '../../../theme';
import { MAX_NOTES_LENGTH } from '../patientForm';

export type PatientNotesSheetProps = {
    visible: boolean;
    onClose: () => void;
    /** What is on file now; `null` is a patient nobody has written about. */
    notes: string | null;
    isPending: boolean;
    /** Localized from `ERROR_CODE`, never parsed from the server's message (§4). */
    error: string | null;
    /** The draft moved after a failure — the reason under it no longer describes it. */
    onDismissError: () => void;
    onSubmit: (draft: string) => void;
};

export function PatientNotesSheet({
    visible,
    onClose,
    notes,
    isPending,
    error,
    onDismissError,
    onSubmit,
}: PatientNotesSheetProps) {
    const t = useT();
    const [draft, setDraft] = useState(notes ?? '');

    // Adjusted during render against the last `visible` seen, as the payment
    // sheet does — a `key` would cut the exit animation.
    const [wasVisible, setWasVisible] = useState(visible);
    if (visible !== wasVisible) {
        setWasVisible(visible);
        if (visible) setDraft(notes ?? '');
    }

    const unchanged = draft.trim() === (notes ?? '').trim();

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title={notes ? 'Edit notes' : 'Add notes'}
            subtitle="Kept on the patient, apart from visit and appointment notes."
            dismissable={!isPending}
            testID="patient-notes-sheet"
            footer={
                <Button
                    label="Save notes"
                    onPress={() => onSubmit(draft)}
                    loading={isPending}
                    disabled={unchanged}
                    block
                    testID="patient-notes-save"
                />
            }
        >
            <Textarea
                accessibilityLabel={t('Patient notes')}
                placeholder="Anything the clinic should know about this patient"
                value={draft}
                onChangeText={(text) => {
                    setDraft(text);
                    if (error) onDismissError();
                }}
                maxLength={MAX_NOTES_LENGTH}
                minHeight={140}
                editable={!isPending}
                autoFocus
                testID="patient-notes-input"
            />

            {error ? (
                <Callout tone="warning" title="The notes were not saved">
                    <Text variant="subhead" tone="due">
                        {error}
                    </Text>
                </Callout>
            ) : null}
        </Sheet>
    );
}
