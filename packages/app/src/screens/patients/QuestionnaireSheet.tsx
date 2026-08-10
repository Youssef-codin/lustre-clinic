import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionBar, Callout, Sheet } from '../../components/ui';
import { space, Text } from '../../theme';
import { CustomAnswerControl } from './components/CustomAnswerControl';
import type { Draft, DraftValue } from './components/customFields';
import { fromDraft, isEditable, toDraft, validateDraft } from './components/customFields';
import type { Answers, CustomQuestion } from './data/types';

/**
 * Answering the clinic's questions for one patient.
 *
 * Three things it is careful about, all of them the same rule from a different
 * side — **a record outlives the questionnaire it was filled in on**:
 *
 * 1. **It sends only what was edited.** `patient.update` merges a partial
 *    `custom` patch over what is stored and validates only the keys it was
 *    sent. Sending the whole form back would re-submit answers nobody touched
 *    against a questionnaire that has moved on since, and correcting one phone
 *    number would fail on a `select` option removed in 2026.
 * 2. **It never sends a key it cannot see.** Deactivated questions are not in
 *    the list, so their answers are not in the patch, so they survive the save
 *    (§7.8: deactivate, never delete — the answers come back if the question
 *    does).
 * 3. **A cleared answer is sent as `''`**, which the server deletes from
 *    `patients.custom` rather than storing blank.
 *
 * The write is slow — it crosses Tailscale to a PC in the clinic — so Save
 * spins, the sheet refuses to close under it, and a failure keeps every draft
 * on screen rather than dropping the secretary back to a record that looks
 * unchanged for reasons she cannot see.
 */

export type QuestionnaireSheetProps = {
    visible: boolean;
    /** Active questions, in the questionnaire's own order. */
    questions: CustomQuestion[];
    /** The patient's stored answers. */
    answers: Answers;
    pending: boolean;
    /** The failed write, if the last attempt failed. */
    error?: string;
    onClose: () => void;
    /** Called with the patch — only the keys that changed. */
    onSave: (patch: Answers) => void;
};

export function QuestionnaireSheet({
    visible,
    questions,
    answers,
    pending,
    error,
    onClose,
    onSave,
}: QuestionnaireSheetProps) {
    // Only the kinds with an editor. A `date` answer is on the record,
    // read-only, and is not silently dropped by being absent here — the patch
    // never carries a key it did not show (§7.9).
    const editable = useMemo(() => questions.filter(isEditable), [questions]);

    const initial = useMemo<Draft>(() => {
        const draft: Draft = {};
        for (const question of editable) draft[question.key] = toDraft(question, answers[question.key]);
        return draft;
    }, [editable, answers]);

    const [draft, setDraft] = useState<Draft>(initial);
    const [showErrors, setShowErrors] = useState(false);

    // Reopening starts from what is stored, so an abandoned edit never
    // reappears as if it had been saved.
    useEffect(() => {
        if (!visible) return;
        setDraft(initial);
        setShowErrors(false);
    }, [visible, initial]);

    const errors = useMemo(() => {
        const found: Record<string, string> = {};
        for (const question of editable) {
            const message = validateDraft(question, draft[question.key] ?? '');
            if (message) found[question.key] = message;
        }
        return found;
    }, [editable, draft]);

    const set = (key: string, value: DraftValue) => setDraft((current) => ({ ...current, [key]: value }));

    const handleSave = () => {
        if (Object.keys(errors).length > 0) {
            setShowErrors(true);
            return;
        }

        const patch: Answers = {};
        for (const question of editable) {
            const next = fromDraft(question, draft[question.key] ?? '');
            const before = fromDraft(question, initial[question.key] ?? '');
            // A boolean that was never answered and is still `false` counts as
            // a change: `false` is an answer, and leaving it out would keep the
            // question in `questionnaireGaps` forever.
            if (next !== before || (question.kind === 'boolean' && answers[question.key] === undefined)) {
                patch[question.key] = next;
            }
        }

        if (Object.keys(patch).length === 0) {
            onClose();
            return;
        }
        onSave(patch);
    };

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title="Clinic questions"
            subtitle="Answers are kept on the record. Nothing here is ever deleted."
            // A write is open; closing under it would leave the secretary
            // unsure whether it landed.
            dismissable={!pending}
            maxHeightRatio={0.88}
            testID="questionnaire-sheet"
            footer={
                <ActionBar
                    primaryLabel={pending ? 'Saving…' : 'Save answers'}
                    onPrimary={handleSave}
                    primaryLoading={pending}
                    secondaryLabel="Cancel"
                    onSecondary={pending ? undefined : onClose}
                    testID="questionnaire-actions"
                />
            }
        >
            {error !== undefined && (
                <Callout tone="warning" title="Not saved">
                    {error}
                </Callout>
            )}

            {editable.length === 0 ? (
                <Text variant="body" tone="muted">
                    The clinic has not set up any questions yet.
                </Text>
            ) : (
                <View style={styles.fields}>
                    {editable.map((question) => (
                        <CustomAnswerControl
                            key={question.key}
                            question={question}
                            value={draft[question.key] ?? ''}
                            onChange={(value) => set(question.key, value)}
                            error={showErrors ? errors[question.key] : undefined}
                        />
                    ))}
                </View>
            )}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    fields: { gap: space[4] },
});
