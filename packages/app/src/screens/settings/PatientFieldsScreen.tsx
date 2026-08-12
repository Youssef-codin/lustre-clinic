/**
 * Settings → Patient fields. Five details are built in — they are columns on
 * `patients`, not questions, so renaming one is a migration. Everything else is
 * a `custom_questions` row the clinic writes, answered under a stable `key`.
 * The verb is deactivate, never delete: deleting orphans every answer on a typo,
 * while deactivating keeps the row so the key still points at the answers and
 * reactivation shows them again. The answer type is fixed once answered —
 * changing it would invalidate the stored answers. Labels need no direction
 * handling; `Text` detects the Arabic script per string.
 */
import type { QuestionKind } from '@lustre/shared';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
import { color, radius, size, space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { api, optionsOf } from './data/_LocalApi';
import { errorMessage, useMutation, useQuery } from './data/hooks';
import type { CustomQuestion } from './data/types';

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
    const questions = useQuery(useCallback(() => api.customQuestion.list({ includeInactive: true }), []));
    const [editing, setEditing] = useState<CustomQuestion | 'new' | null>(null);
    const [reordering, setReordering] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const reorder = useMutation((ids: string[]) => api.customQuestion.reorder(ids));

    const rows = questions.data ?? [];
    const active = rows.filter((q) => q.active);
    const inactive = rows.filter((q) => !q.active);

    async function move(index: number, delta: number) {
        const next = [...active];
        const moved = next[index];
        const target = next[index + delta];
        if (!moved || !target) return;
        next[index] = target;
        next[index + delta] = moved;
        await reorder.run(next.map((row) => row.id));
        questions.reload();
    }

    // Not while reordering — the same reason as `ProceduresScreen`.
    const refreshControl = usePullToRefresh(() => {
        if (!reordering) questions.reload();
    }, questions.loading || questions.reloading);

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
                <FixedDetailsCard />

                {questions.loading ? <SkeletonRows count={3} /> : null}

                {questions.error ? (
                    <ErrorState
                        message={errorMessage(questions.error) ?? ''}
                        onRetry={questions.reload}
                        retrying={questions.reloading}
                    />
                ) : null}

                {reorder.error ? (
                    <Callout tone="warning" title="Order not saved">
                        {errorMessage(reorder.error) ?? ''}
                    </Callout>
                ) : null}

                {questions.data ? (
                    <>
                        <View style={styles.section}>
                            <SectionLabel inset={false} count={active.length}>
                                YOUR QUESTIONS
                            </SectionLabel>

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
                                                reorderDisabled={reorder.pending}
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
                        onClose={() => setEditing(null)}
                        onSaved={(message) => {
                            setEditing(null);
                            setToast(message);
                            questions.reload();
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
            <SectionLabel inset={false}>ALWAYS ASKED</SectionLabel>
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
                    Every patient record has these. They can't be renamed, reordered or removed.
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

    const body = (
        <View style={[styles.rowText, !question.active && styles.dimmed]}>
            <Text variant="body" weight="medium">
                {question.label}
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
                    itemLabel={question.label}
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
            accessibilityLabel={question.label}
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
    onClose: () => void;
    onSaved: (message: string) => void;
};

function QuestionEditor({ question, onClose, onSaved }: QuestionEditorProps) {
    const [label, setLabel] = useState(question?.label ?? '');
    const [key, setKey] = useState(question?.key ?? '');
    const [keyEdited, setKeyEdited] = useState(question !== null);
    const [kind, setKind] = useState<QuestionKind>(question?.kind ?? 'boolean');
    const [options, setOptions] = useState<string[]>(question ? optionsOf(question) : []);
    const [required, setRequired] = useState(question?.required ?? false);
    const [submitted, setSubmitted] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const save = useMutation(async () => {
        if (question) {
            return api.customQuestion.update({
                id: question.id,
                label,
                options: kind === 'select' ? options : undefined,
                required,
            });
        }
        return api.customQuestion.create({
            key,
            label,
            kind,
            options: kind === 'select' ? options : null,
            required,
        });
    });

    const setActive = useMutation((active: boolean) =>
        api.customQuestion.update({ id: question?.id ?? '', active }),
    );

    const labelError = submitted && label.trim() === '' ? 'A question needs to say something.' : undefined;
    const keyError =
        submitted && !/^[a-z][a-z0-9_]*$/.test(key)
            ? 'Lowercase letters, numbers and underscores. It has to start with a letter.'
            : undefined;
    const optionsError =
        submitted && kind === 'select' && options.length < 2 ? 'A dropdown needs at least two options.' : '';
    const busy = save.pending || setActive.pending;

    function onChangeLabel(next: string) {
        setLabel(next);
        if (!keyEdited) setKey(toKey(next));
    }

    async function onSave() {
        setSubmitted(true);
        if (label.trim() === '') return;
        if (!question && !/^[a-z][a-z0-9_]*$/.test(key)) return;
        if (kind === 'select' && options.length < 2) return;

        const saved = await save.run(undefined);
        if (saved) onSaved(question ? 'Question saved' : 'Question added');
    }

    async function onToggleActive() {
        if (!question) return;
        const updated = await setActive.run(!question.active);
        setConfirming(false);
        if (updated) onSaved(updated.active ? 'Question reactivated' : 'Question deactivated');
    }

    return (
        <Pane
            title={question ? 'Edit question' : 'New question'}
            onBack={busy ? () => {} : onClose}
            footer={
                <ActionBar
                    primaryLabel={save.pending ? 'Saving' : 'Save'}
                    onPrimary={onSave}
                    primaryLoading={save.pending}
                    primaryDisabled={setActive.pending}
                    secondaryLabel="Cancel"
                    onSecondary={busy ? undefined : onClose}
                />
            }
        >
            {save.error || setActive.error ? (
                <Callout tone="warning" title="Not saved">
                    {errorMessage(save.error ?? setActive.error) ?? ''}
                </Callout>
            ) : null}

            <Card padded style={styles.form}>
                <TextField
                    label="Question"
                    required
                    value={label}
                    onChangeText={onChangeLabel}
                    placeholder="Diabetic?"
                    error={labelError}
                />

                {question ? null : (
                    <TextField
                        label="Stored as"
                        required
                        value={key}
                        onChangeText={(next) => {
                            setKeyEdited(true);
                            setKey(next);
                        }}
                        placeholder="diabetic"
                        autoCapitalize="none"
                        autoCorrect={false}
                        error={keyError}
                        hint="Answers are filed under this. It can't be changed once the question exists."
                    />
                )}
            </Card>

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
                        The answer type is fixed once patients have answered. Add a new question instead.
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

            <Card>
                <View style={styles.flagRow}>
                    <View style={styles.rowText}>
                        <Text variant="body" weight="medium">
                            Required
                        </Text>
                        <Text variant="subhead" tone="muted">
                            A new patient can't be saved without an answer.
                        </Text>
                    </View>
                    <Switch value={required} onValueChange={setRequired} accessibilityLabel="Required" />
                </View>
            </Card>

            <View style={styles.section}>
                <SectionLabel inset={false}>ON THE PATIENT RECORD</SectionLabel>
                <FieldPreview label={label} kind={kind} options={options} required={required} />
            </View>

            {question ? (
                <Card padded style={styles.form}>
                    <Text variant="subhead" tone="muted">
                        {question.active
                            ? 'Deactivating stops it being asked. Answers already given are kept, not erased, and come back if you reactivate it.'
                            : 'This question is not being asked. Reactivating brings it and its answers back.'}
                    </Text>
                    <Button
                        label={question.active ? 'Deactivate question' : 'Reactivate question'}
                        variant={question.active ? 'danger' : 'secondary'}
                        onPress={() => setConfirming(true)}
                        loading={setActive.pending}
                        block
                    />
                </Card>
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
                loading={setActive.pending}
                onConfirm={onToggleActive}
                onCancel={() => setConfirming(false)}
            />
        </Pane>
    );
}

type FieldPreviewProps = {
    label: string;
    kind: QuestionKind;
    options: string[];
    required: boolean;
};

function FieldPreview({ label, kind, options, required }: FieldPreviewProps) {
    return (
        <Card variant="dashed" padded style={styles.preview}>
            <View style={styles.previewLabel}>
                <Text variant="subhead" tone="muted">
                    {label.trim() === '' ? 'Your question' : label}
                </Text>
                {required ? (
                    <Text variant="subhead" tone="danger">
                        *
                    </Text>
                ) : null}
            </View>

            {kind === 'boolean' ? (
                <View style={styles.previewPills}>
                    <View style={[styles.previewPill, styles.previewPillOn]}>
                        <Text variant="callout" tone="inverse">
                            Yes
                        </Text>
                    </View>
                    <View style={styles.previewPill}>
                        <Text variant="callout" tone="ink2">
                            No
                        </Text>
                    </View>
                </View>
            ) : (
                <View style={styles.previewLine}>
                    <Text variant="body" tone="muted">
                        {previewValue(kind, options)}
                    </Text>
                    {kind === 'select' ? <Chevron direction="down" tone="muted" /> : null}
                </View>
            )}

            <Text variant="caption" tone="muted">
                Preview only — nothing here is saved.
            </Text>
        </Card>
    );
}

function previewValue(kind: QuestionKind, options: string[]): string {
    switch (kind) {
        case 'select':
            return options[0] ?? 'Pick one';
        case 'number':
            return '0';
        case 'date':
            return 'DD / MM / YYYY';
        default:
            return 'Their answer';
    }
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
    form: { gap: space[4] },
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
    preview: { gap: space[2] },
    previewLabel: { flexDirection: 'row', gap: space[1] },
    previewPills: { flexDirection: 'row', gap: space[2] },
    previewPill: {
        minHeight: size.row,
        justifyContent: 'center',
        paddingHorizontal: space[4],
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    previewPillOn: { backgroundColor: color.ink, borderColor: color.ink },
    previewLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: size.control,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
});
