import { StyleSheet, View } from 'react-native';
import { Tag } from '../../../components/ui';
import { size, space, Text } from '../../../theme';
import type { CustomQuestion, QuestionnaireGapReason } from '../data/types';
import { displayAnswer, isReadOnly } from './customFields';

/**
 * One clinic question and its answer on the record — Component Inventory §5's
 * `QARow`: label on the start edge, answer bold on the end edge.
 *
 * Nothing here knows what any question is. It renders a `label`, a `kind` and
 * whatever is stored under `key`, which is the whole point: the questionnaire
 * is the dentist's, and a second clinic's is a different list.
 *
 * The label sets no face — an Arabic question and a Latin one sit in the same
 * card and `<Text>` picks the script per string (§6).
 */

export type CustomAnswerRowProps = {
    question: CustomQuestion;
    /** The raw stored answer from `patients.custom`, if there is one. */
    value: unknown;
    /** From `patient.byId`'s `questionnaireGaps`, when this question is in it. */
    gap?: QuestionnaireGapReason;
};

const GAP_LABEL: Record<QuestionnaireGapReason, string> = {
    unanswered: 'NEVER ASKED',
    answer_no_longer_valid: 'ASK AGAIN',
};

export function CustomAnswerRow({ question, value, gap }: CustomAnswerRowProps) {
    const answer = displayAnswer(question, value);

    return (
        <View style={styles.row} testID={`answer-row-${question.key}`}>
            <View style={styles.label}>
                <Text variant="subhead" tone="muted" numberOfLines={2}>
                    {question.label}
                </Text>
                {question.required && (
                    <Text variant="subhead" tone="due">
                        {' *'}
                    </Text>
                )}
            </View>

            <View style={styles.value}>
                {answer === null ? (
                    <Text variant="body" tone="muted">
                        —
                    </Text>
                ) : (
                    <Text variant="body" weight="semibold">
                        {answer}
                    </Text>
                )}

                {gap !== undefined && (
                    <Tag tone={question.required ? 'due' : 'muted'} variant="filled">
                        {GAP_LABEL[gap]}
                    </Tag>
                )}

                {/* §7.9 — the answer is shown, the editor is not built yet. */}
                {answer !== null && isReadOnly(question) && (
                    <Text variant="caption" tone="muted">
                        Read-only for now
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        minHeight: size.row,
        paddingHorizontal: space[4],
        paddingVertical: space[2.5],
    },
    // 150px, per the design. A two-line Arabic label still clears the row.
    label: { width: 150, flexDirection: 'row', alignItems: 'flex-start' },
    value: { flex: 1, alignItems: 'flex-end', gap: space[1] },
});
