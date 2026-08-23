// One clinic question and its answer on the record: label on the start edge,
// answer bold on the end edge. Nothing here knows what any question is — it
// renders a label, a kind and whatever is stored, which is the point: a second
// clinic's questionnaire is a different list. The label sets no face; `<Text>`
// picks the script per string (§6). §7.9: an answer to a kind with no editor
// (today `date`) is shown read-only.
import { resolveLabel } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import { Tag } from '../../../components/ui';
import { useLocale } from '../../../shell/localeStore';
import { size, space, Text } from '../../../theme';
import type { CustomQuestion, QuestionnaireGapReason } from '../data/types';
import { displayAnswer, isReadOnly } from './customFields';

export type CustomAnswerRowProps = {
    question: CustomQuestion;
    value: unknown;
    gap?: QuestionnaireGapReason;
};

// Only the gap the row cannot show on its own. `unanswered` has a dash in the
// answer column already, and a pill next to it saying the same thing twice was
// the loudest object on a tab that is otherwise a quiet list; the count at the
// top of the tab does the summarising. A stale answer is the other case: it
// reads as a perfectly good answer, so nothing but a mark distinguishes it.
const GAP_LABEL: Partial<Record<QuestionnaireGapReason, string>> = {
    answer_no_longer_valid: 'ASK AGAIN',
};

export function CustomAnswerRow({ question, value, gap }: CustomAnswerRowProps) {
    const answer = displayAnswer(question, value);
    const gapLabel = gap === undefined ? undefined : GAP_LABEL[gap];
    const label = resolveLabel(question, useLocale());

    return (
        <View style={styles.row} testID={`answer-row-${question.key}`}>
            <View style={styles.label}>
                <Text variant="subhead" tone="muted" numberOfLines={2}>
                    {label}
                </Text>
                {question.required && (
                    <Text variant="subhead" tone="due">
                        {' *'}
                    </Text>
                )}
            </View>

            <View style={styles.value}>
                {answer === null ? (
                    <Text variant="callout" tone="muted">
                        —
                    </Text>
                ) : (
                    <Text variant="callout" weight="bold" style={styles.answer}>
                        {answer}
                    </Text>
                )}

                {/* `Tag` sets `alignSelf: flex-start`, which beats the column's
                    `flex-end` and strands the pill mid-row. The wrapper takes
                    the right edge and the tag aligns inside it. */}
                {gapLabel !== undefined && (
                    <View>
                        <Tag tone={question.required ? 'due' : 'muted'} variant="filled">
                            {gapLabel}
                        </Tag>
                    </View>
                )}

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
    // No horizontal padding of its own: the record wraps each row in the page
    // gutter, and a second inset here would step the questions in from the
    // history rows they are ruled in line with.
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3.5],
        minHeight: size.row,
        paddingVertical: space[2.5],
    },
    label: { width: 150, flexDirection: 'row', alignItems: 'flex-start' },
    value: { flex: 1, alignItems: 'flex-end', gap: space[1] },
    answer: { textAlign: 'right' },
});
