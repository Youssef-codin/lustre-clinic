// Answering the clinic's questions for one patient. A record outlives the
// questionnaire it was filled in on, so: only edited keys are sent (`update`
// validates only what it was sent — resubmitting the whole form would fail on
// a `select` option removed since); deactivated questions are never in the
// patch, so their answers survive (§7.8); a cleared answer is sent as `''`,
// which the server deletes rather than storing blank. A boolean answered
// `false` still counts as a change, so leaving it out would keep the question
// in `questionnaireGaps` forever. Only the patch is validated — a stale
// `select` answer stays visible as a gap on the record, and blocking Save on
// it would stop the secretary fixing an unrelated answer. The write crosses
// Tailscale, so Save spins, the sheet refuses to close under it, and a failure
// keeps every draft on screen.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionBar, Callout, Sheet } from '../../components/ui';
import { space, Text } from '../../theme';
import { CustomAnswerControl } from './components/CustomAnswerControl';
import type { Draft, DraftValue } from './components/customFields';
import { fromDraft, isEditable, toDraft, validateDraft } from './components/customFields';
import type { Answers, CustomQuestion } from './data/types';

export type QuestionnaireSheetProps = {
    visible: boolean;
    questions: CustomQuestion[];
    answers: Answers;
    pending: boolean;
    error?: string;
    onClose: () => void;
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
    const editable = useMemo(() => questions.filter(isEditable), [questions]);

    const initial = useMemo<Draft>(() => {
        const draft: Draft = {};
        for (const question of editable) draft[question.key] = toDraft(question, answers[question.key]);
        return draft;
    }, [editable, answers]);

    const [draft, setDraft] = useState<Draft>(initial);
    const [showErrors, setShowErrors] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setDraft(initial);
        setShowErrors(false);
    }, [visible, initial]);

    const patch = useMemo(() => {
        const changed: Answers = {};
        for (const question of editable) {
            const next = fromDraft(question, draft[question.key] ?? '');
            const before = fromDraft(question, initial[question.key] ?? '');
            if (next !== before || (question.kind === 'boolean' && answers[question.key] === undefined)) {
                changed[question.key] = next;
            }
        }
        return changed;
    }, [editable, draft, initial, answers]);

    const errors = useMemo(() => {
        const found: Record<string, string> = {};
        for (const question of editable) {
            if (!(question.key in patch)) continue;
            const message = validateDraft(question, draft[question.key] ?? '');
            if (message) found[question.key] = message;
        }
        return found;
    }, [editable, draft, patch]);

    const set = (key: string, value: DraftValue) => setDraft((current) => ({ ...current, [key]: value }));

    const handleSave = () => {
        if (Object.keys(errors).length > 0) {
            setShowErrors(true);
            return;
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
