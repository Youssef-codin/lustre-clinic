/**
 * Settings → Patient fields. Five details are built in — they are columns on
 * `patients`, not questions, so renaming one is a migration. Everything else is
 * a `custom_questions` row the clinic writes, answered under a stable `key`.
 * The verb is deactivate, never delete: deleting orphans every answer on a typo,
 * while deactivating keeps the row so the key still points at the answers and
 * reactivation shows them again. The answer type is fixed once answered —
 * changing it would invalidate the stored answers.
 *
 * A question is written in both languages and read back in one, through
 * `resolveLabel` (§14). The answer is not: it is stored once, in whichever
 * language it was given. Labels need no direction handling; `Text` and
 * `TextField` detect the Arabic script per string.
 */
import { type QuestionKind, resolveLabel } from '@lustre/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type RouterOutput, useTRPC } from '../../api';
import {
    ActionBar,
    AddButton,
    Button,
    Callout,
    Card,
    CardDivider,
    Chevron,
    Chip,
    ConfirmSheet,
    EmptyState,
    ListEditor,
    PushView,
    ReorderControls,
    SectionLabel,
    Switch,
    Tag,
    TextField,
    Toast,
    usePullToRefresh,
} from '../../components/ui';
import { useLocale } from '../../shell/localeStore';
import { color, radius, size, space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { errorText } from './data/errors';

type CustomQuestion = RouterOutput['customQuestion']['list'][number];

/** `options` is `jsonb`, so it arrives as `unknown` for every other kind. */
function optionsOf(question: CustomQuestion): string[] {
    return Array.isArray(question.options) ? (question.options as string[]) : [];
}

const FIXED_DETAILS = ['Full name', 'Phone', 'Email', 'Age', 'Sex'] as const;

const KIND_LABEL: Record<QuestionKind, string> = {
    boolean: 'Yes / no',
    select: 'Dropdown',
    text: 'Short text',
    number: 'Number',
    date: 'Date',
};

const KINDS: readonly QuestionKind[] = ['boolean', 'select', 'text', 'number', 'date'];

export function PatientFieldsScreen({ onBack }: { onBack: () => void }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const questions = useQuery(trpc.customQuestion.list.queryOptions({ includeInactive: true }));
    const [editing, setEditing] = useState<CustomQuestion | 'new' | null>(null);
    const [reordering, setReordering] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const reorder = useMutation(
        trpc.customQuestion.reorder.mutationOptions({
            onSuccess: () => queryClient.invalidateQueries(trpc.customQuestion.pathFilter()),
        }),
    );

    const rows = questions.data ?? [];
    const active = rows.filter((q) => q.active);
    const inactive = rows.filter((q) => !q.active);

    // One write for the whole list, so a dropped connection leaves the order it
    // had rather than half of the new one.
    function move(index: number, delta: number) {
        const next = [...active];
        const moved = next[index];
        const target = next[index + delta];
        if (!moved || !target) return;
        next[index] = target;
        next[index + delta] = moved;
        reorder.mutate({ ids: next.map((row) => row.id) });
    }

    // Not while reordering — the same reason as `ProceduresScreen`.
    const refreshControl = usePullToRefresh(() => {
        if (!reordering) void questions.refetch();
    }, questions.isFetching);

    return (
        <>
            <Pane
                title="Patient fields"
                onBack={reordering ? () => setReordering(false) : onBack}
                refreshControl={refreshControl}
                trailing={
                    active.length > 1 ? (
                        <Button
                            label={reordering ? 'Done' : 'Reorder'}
                            variant="text"
                            size="md"
                            onPress={() => setReordering((on) => !on)}
                        />
                    ) : null
                }
                overlay={
                    <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
                }
            >
                <Text variant="subhead" tone="muted" style={styles.intro}>
                    These questions appear on every patient record, under the details the app always asks for.
                    Changing them here changes the form for the whole clinic.
                </Text>

                <FixedDetailsCard />

                {questions.isLoading ? <SkeletonRows count={3} /> : null}

                {questions.error ? (
                    <ErrorState
                        message={errorText(questions.error)}
                        onRetry={questions.refetch}
                        retrying={questions.isFetching}
                    />
                ) : null}

                {reorder.error ? (
                    <Callout tone="warning" title="Order not saved">
                        {errorText(reorder.error)}
                    </Callout>
                ) : null}

                {questions.data ? (
                    <>
                        <View style={styles.section}>
                            <SectionLabel inset={false} count={active.length}>
                                CLINIC QUESTIONS
                            </SectionLabel>

                            {reordering ? (
                                <Text variant="footnote" tone="muted" style={styles.note}>
                                    This is the order the questions appear on the patient record. Move them
                                    with the arrows.
                                </Text>
                            ) : null}

                            {active.length === 0 ? (
                                <EmptyState
                                    weight="panel"
                                    title="No questions yet"
                                    body="Ask what you need on top of the built-in details — medical history, how they found you, anything."
                                    actionLabel="Add a question"
                                    onAction={() => setEditing('new')}
                                />
                            ) : (
                                <Card>
                                    {active.map((question, index) => (
                                        <View key={question.id}>
                                            {index > 0 ? <CardDivider /> : null}
                                            <QuestionRow
                                                question={question}
                                                reordering={reordering}
                                                reorderDisabled={reorder.isPending}
                                                isFirst={index === 0}
                                                isLast={index === active.length - 1}
                                                onPress={() => setEditing(question)}
                                                onMoveUp={() => move(index, -1)}
                                                onMoveDown={() => move(index, 1)}
                                            />
                                        </View>
                                    ))}
                                </Card>
                            )}
                        </View>

                        {active.length > 0 && !reordering ? (
                            <AddButton label="Add a question" onPress={() => setEditing('new')} />
                        ) : null}

                        {inactive.length > 0 ? (
                            <View style={styles.section}>
                                <SectionLabel inset={false} count={inactive.length}>
                                    DEACTIVATED
                                </SectionLabel>
                                <Card variant="dashed">
                                    {inactive.map((question, index) => (
                                        <View key={question.id}>
                                            {index > 0 ? <CardDivider /> : null}
                                            <QuestionRow
                                                question={question}
                                                reordering={false}
                                                reorderDisabled
                                                isFirst
                                                isLast
                                                onPress={() => setEditing(question)}
                                                onMoveUp={() => {}}
                                                onMoveDown={() => {}}
                                            />
                                        </View>
                                    ))}
                                </Card>
                                <Text variant="footnote" tone="muted" style={styles.note}>
                                    These stop being asked. The answers patients already gave are kept, and
                                    come back if the question does.
                                </Text>
                            </View>
                        ) : null}
                    </>
                ) : null}
            </Pane>

            <PushView visible={editing !== null}>
                {editing !== null ? (
                    <QuestionEditor
                        question={editing === 'new' ? null : editing}
                        nextSortOrder={rows.length}
                        onClose={() => setEditing(null)}
                        onSaved={(message) => {
                            setEditing(null);
                            setToast(message);
                        }}
                    />
                ) : null}
            </PushView>
        </>
    );
}

function FixedDetailsCard() {
    return (
        <View style={styles.section}>
            <SectionLabel inset={false}>ALWAYS ON THE RECORD</SectionLabel>
            <Card variant="dashed" padded style={styles.fixed}>
                <View style={styles.chips}>
                    {FIXED_DETAILS.map((detail) => (
                        <View key={detail} style={styles.fixedChip}>
                            <Text variant="subhead" tone="ink2">
                                {detail}
                            </Text>
                        </View>
                    ))}
                </View>
                <Text variant="footnote" tone="muted">
                    Built in — these five can't be renamed, reordered or removed.
                </Text>
            </Card>
        </View>
    );
}

type QuestionRowProps = {
    question: CustomQuestion;
    reordering: boolean;
    reorderDisabled: boolean;
    isFirst: boolean;
    isLast: boolean;
    onPress: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
};

function QuestionRow({
    question,
    reordering,
    reorderDisabled,
    isFirst,
    isLast,
    onPress,
    onMoveUp,
    onMoveDown,
}: QuestionRowProps) {
    const type =
        question.kind === 'select'
            ? `${KIND_LABEL.select} · ${optionsOf(question).length} options`
            : KIND_LABEL[question.kind];

    // The secretary reads the list in the language her phone is set to, even
    // here where she is the one who wrote both sides.
    const locale = useLocale();
    const shown = resolveLabel(question, locale);

    const body = (
        <View style={[styles.rowText, !question.active && styles.dimmed]}>
            <Text variant="body" weight="medium">
                {shown}
            </Text>
            <View style={styles.tags}>
                <Tag tone="muted">{type.toUpperCase()}</Tag>
                {question.required ? (
                    <Tag tone="ink" variant="filled">
                        REQUIRED
                    </Tag>
                ) : null}
                {question.active ? null : (
                    <Tag tone="muted" variant="muted">
                        INACTIVE
                    </Tag>
                )}
            </View>
        </View>
    );

    if (reordering) {
        return (
            <View style={styles.row}>
                {body}
                <ReorderControls
                    itemLabel={shown}
                    isFirst={isFirst || reorderDisabled}
                    isLast={isLast || reorderDisabled}
                    onMoveUp={onMoveUp}
                    onMoveDown={onMoveDown}
                />
            </View>
        );
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown}
            onPress={onPress}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
            {body}
            <Chevron direction="forward" tone="muted" />
        </Pressable>
    );
}

type QuestionEditorProps = {
    question: CustomQuestion | null;
    /** Where a new question lands: after every one already asked. */
    nextSortOrder: number;
    onClose: () => void;
    onSaved: (message: string) => void;
};

function QuestionEditor({ question, nextSortOrder, onClose, onSaved }: QuestionEditorProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const onQuestionWritten = () => queryClient.invalidateQueries(trpc.customQuestion.pathFilter());

    const [label, setLabel] = useState(question?.label ?? '');
    const [labelAr, setLabelAr] = useState(question?.labelAr ?? '');
    const [key, setKey] = useState(question?.key ?? '');
    const [keyEdited, setKeyEdited] = useState(question !== null);
    const [kind, setKind] = useState<QuestionKind>(question?.kind ?? 'boolean');
    const [options, setOptions] = useState<string[]>(question ? optionsOf(question) : []);
    const [required, setRequired] = useState(question?.required ?? false);
    const [submitted, setSubmitted] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const create = useMutation(trpc.customQuestion.create.mutationOptions({ onSuccess: onQuestionWritten }));
    const update = useMutation(trpc.customQuestion.update.mutationOptions({ onSuccess: onQuestionWritten }));

    const labelError = submitted && label.trim() === '' ? 'A question needs to say something.' : undefined;
    const keyError =
        submitted && !/^[a-z][a-z0-9_]*$/.test(key)
            ? 'Lowercase letters, numbers and underscores. It has to start with a letter.'
            : undefined;
    const optionsError =
        submitted && kind === 'select' && options.length < 2 ? 'A dropdown needs at least two options.' : '';
    const saving = create.isPending || (update.isPending && !confirming);
    const busy = create.isPending || update.isPending;
    const failure = create.error ?? update.error;

    function onChangeLabel(next: string) {
        setLabel(next);
        if (!keyEdited) setKey(toKey(next));
    }

    function onSave() {
        setSubmitted(true);
        if (label.trim() === '') return;
        if (!question && !/^[a-z][a-z0-9_]*$/.test(key)) return;
        if (kind === 'select' && options.length < 2) return;

        if (question) {
            update.mutate(
                {
                    id: question.id,
                    label: label.trim(),
                    labelAr,
                    options: kind === 'select' ? options : undefined,
                    required,
                },
                { onSuccess: () => onSaved('Question saved') },
            );
            return;
        }

        create.mutate(
            {
                key,
                label: label.trim(),
                labelAr,
                kind,
                options: kind === 'select' ? options : null,
                required,
                sortOrder: nextSortOrder,
            },
            { onSuccess: () => onSaved('Question added') },
        );
    }

    function onToggleActive() {
        if (!question) return;
        update.mutate(
            { id: question.id, active: !question.active },
            {
                onSuccess: (updated) => {
                    setConfirming(false);
                    onSaved(updated.active ? 'Question reactivated' : 'Question deactivated');
                },
            },
        );
    }

    return (
        <Pane
            title={question ? 'Edit question' : 'New question'}
            onBack={busy ? () => {} : onClose}
            footer={
                <ActionBar
                    primaryLabel={saving ? 'Saving' : 'Save'}
                    onPrimary={onSave}
                    primaryLoading={saving}
                    primaryDisabled={busy}
                    secondaryLabel="Cancel"
                    onSecondary={busy ? undefined : onClose}
                />
            }
        >
            {failure ? (
                <Callout tone="warning" title="Not saved">
                    {errorText(failure)}
                </Callout>
            ) : null}

            {/* Two inputs under one heading: they are one question, not two
                fields. Neither needs direction handling — `TextField` takes its
                face and its alignment from what is in it. */}
            <View style={styles.section}>
                <SectionLabel inset={false}>QUESTION</SectionLabel>
                <View style={styles.labelPair}>
                    <TextField
                        value={label}
                        onChangeText={onChangeLabel}
                        placeholder="Diabetic?"
                        accessibilityLabel="Question in English"
                        error={labelError}
                    />
                    <TextField
                        value={labelAr}
                        onChangeText={setLabelAr}
                        placeholder="هل تعاني من السكري؟"
                        accessibilityLabel="Question in Arabic"
                    />
                </View>
            </View>

            {question ? null : (
                <View style={styles.section}>
                    <SectionLabel inset={false}>STORED AS</SectionLabel>
                    <TextField
                        value={key}
                        onChangeText={(next) => {
                            setKeyEdited(true);
                            setKey(next);
                        }}
                        placeholder="diabetic"
                        accessibilityLabel="Stored as"
                        autoCapitalize="none"
                        autoCorrect={false}
                        error={keyError}
                        hint="Answers are filed under this. It can't change later."
                    />
                </View>
            )}

            <View style={styles.section}>
                <SectionLabel inset={false}>ANSWER TYPE</SectionLabel>
                <View style={styles.chips}>
                    {KINDS.map((option) => (
                        <Chip
                            key={option}
                            label={KIND_LABEL[option]}
                            selected={kind === option}
                            disabled={question !== null}
                            onPress={() => setKind(option)}
                        />
                    ))}
                </View>
                {question ? (
                    <Text variant="footnote" tone="muted" style={styles.note}>
                        Fixed once patients have answered.
                    </Text>
                ) : null}
            </View>

            {kind === 'select' ? (
                <View style={styles.section}>
                    <SectionLabel inset={false}>OPTIONS</SectionLabel>
                    <ListEditor
                        items={options}
                        onChange={setOptions}
                        placeholder="Facebook"
                        addLabel="Add"
                        minItems={2}
                        minItemsHint={optionsError || 'Add at least two options.'}
                    />
                </View>
            ) : null}

            {/* The same control as ANSWER TYPE above it, for the same reason:
                one boolean does not need a card, a bolded restatement of the
                heading and a sentence explaining itself. Two options say it. */}
            <View style={styles.section}>
                <SectionLabel inset={false}>REQUIRED</SectionLabel>
                <Card>
                    <View style={styles.flagRow}>
                        <Text variant="body" style={styles.rowText}>
                            {required ? 'Must be answered' : 'Can be left blank'}
                        </Text>
                        <Switch value={required} onValueChange={setRequired} accessibilityLabel="Required" />
                    </View>
                </Card>
            </View>

            {/* No paragraph over it: `ConfirmSheet` says what deactivating
                costs at the moment the choice is actually made, and saying it
                twice only makes the quieter copy easier to skip. */}
            {question ? (
                <Button
                    label={question.active ? 'Deactivate question' : 'Reactivate question'}
                    variant={question.active ? 'danger' : 'secondary'}
                    onPress={() => setConfirming(true)}
                    loading={update.isPending && confirming}
                    block
                />
            ) : null}

            <ConfirmSheet
                visible={confirming}
                title={question?.active ? 'Deactivate this question?' : 'Reactivate this question?'}
                body={
                    question?.active
                        ? 'It stops being asked on new and existing records. Nothing is erased — every answer stays where it is, and comes back if you turn it on again.'
                        : 'It is asked again, and the answers already given show up again.'
                }
                confirmLabel={question?.active ? 'Deactivate' : 'Reactivate'}
                destructive={question?.active}
                loading={update.isPending && confirming}
                onConfirm={onToggleActive}
                onCancel={() => setConfirming(false)}
            />
        </Pane>
    );
}

function toKey(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
}

const styles = StyleSheet.create({
    section: { gap: space[2] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[2],
        paddingHorizontal: space[4],
        paddingVertical: space[2],
    },
    pressed: { backgroundColor: color.surface2 },
    rowText: { flex: 1, gap: space[1] },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1.5] },
    dimmed: { opacity: 0.5 },
    note: { paddingHorizontal: space[1] },
    intro: { paddingHorizontal: space[0.5] },
    labelPair: { gap: space[2] },
    fixed: { gap: space[3] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    fixedChip: {
        paddingHorizontal: space[3],
        paddingVertical: space[1.5],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    flagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        minHeight: size.row,
    },
});
