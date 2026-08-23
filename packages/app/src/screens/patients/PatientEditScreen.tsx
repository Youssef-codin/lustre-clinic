// Registering a patient and correcting one — `patient-edit.html`, followed
// structurally: the cancel cross and the title, BASICS as one card of four
// ruled rows, then the clinic's questions under a label that counts them and a
// progress bar across them, and the save pinned to the bottom over a hairline.
//
// One screen for both jobs because the design draws one. What differs is
// entirely in `patientForm.ts`: a create sends the whole form and cannot be
// saved until every required question is answered, an edit sends only what
// moved and is never held back by a question nobody has answered yet. That
// asymmetry is the server's own — `validateIntake` is the whole form,
// `validatePatch` is only the keys it was given (§7.8) — and it is what lets a
// record outlive the questionnaire it was filled in on.
//
// Layout notes that are the design's and not defaults: BASICS is a card and the
// questions are not, because the four facts are a block that is always the same
// four and the questions are a list whose length is the clinic's. The footer
// carries the page's own colour and a hairline rather than `ui/ActionBar`'s
// white — the design keeps one ground from the status bar down and lets the
// rule do the separating.
//
// The write crosses Tailscale, so Save spins, cancel is disabled under it, and
// a failure keeps every field on screen with a `Callout` saying why. Android is
// `adjustResize`, so the window shrinks around the keyboard and the footer
// stays above it without being translated.
import { resolveLabel } from '@lustre/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Callout, EmptyState } from '../../components/ui';
import { useLocale } from '../../shell/localeStore';
import { border, color, radius, size, space, Text } from '../../theme';
import { SkeletonRows } from './components/_LocalSkeleton';
import { AnswerEditor, ReadOnlyAnswer } from './components/AnswerEditor';
import { BasicsCard } from './components/BasicsCard';
import { displayAnswer, isEditable } from './components/customFields';
import { CloseIcon } from './components/icons';
import { useMutation, useQuery } from './data/_LocalQuery';
import { patientsApi } from './data/api';
import { errorText } from './data/errors';
import type { CustomQuestion, PatientDetail } from './data/types';
import type { PatientForm } from './patientForm';
import {
    answeredCount,
    blankBasics,
    clearedRequired,
    createInputOf,
    emptyForm,
    formOf,
    isUnchanged,
    malformedBasics,
    missingRequired,
    unaskableRequired,
    updateInputOf,
} from './patientForm';

export type PatientEditScreenProps = {
    /** Absent = registering someone new. Present = correcting the record it names. */
    patientId?: string;
    onCancel: () => void;
    /** The patient that now exists, or the one that was just corrected. */
    onSaved: (patientId: string) => void;
};

export function PatientEditScreen({ patientId, onCancel, onSaved }: PatientEditScreenProps) {
    const creating = patientId === undefined;

    const questions = useQuery(() => patientsApi.listQuestions(), []);
    const record = useQuery(
        (): Promise<PatientDetail | undefined> =>
            patientId ? patientsApi.byId(patientId) : Promise.resolve(undefined),
        [patientId],
    );

    const create = useMutation(patientsApi.create);
    const update = useMutation(patientsApi.update);
    const save = creating ? create : update;

    // Only the kinds with a control. A `date` answer already on the record is
    // drawn below, read-only, and is never in the form.
    const editable = useMemo(() => (questions.data ?? []).filter(isEditable), [questions.data]);
    const readOnly = useMemo(
        () => (questions.data ?? []).filter((question) => !isEditable(question)),
        [questions.data],
    );

    const initial = useMemo<PatientForm | null>(() => {
        if (!questions.data) return null;
        if (creating) return emptyForm(editable);
        return record.data ? formOf(record.data.patient, editable) : null;
    }, [creating, questions.data, record.data, editable]);

    // Seeded once and then left alone: this is a draft the desk is typing into,
    // and a re-read landing underneath it would take back what they wrote.
    const [form, setForm] = useState<PatientForm | null>(null);
    const seeded = useRef(false);

    useEffect(() => {
        if (seeded.current || initial === null) return;
        seeded.current = true;
        setForm(initial);
    }, [initial]);

    const loading = questions.loading || record.loading;
    const failed = questions.error ?? record.error;

    const blank = form ? blankBasics(form) : [];
    const malformed = form ? malformedBasics(form) : {};
    const missing = form ? missingRequired(form, editable) : [];
    const answered = form ? answeredCount(form, editable) : 0;

    // A required answer the desk has emptied. Not the same as one never given:
    // the blank is in the patch, and the server throws on it rather than
    // deleting it, so the button has to refuse it here.
    const cleared = form && initial ? clearedRequired(form, initial, editable) : [];

    // The design's own arithmetic on the button: what is still owed before this
    // can be saved. On an edit that is the two facts a patient cannot be without
    // plus anything emptied — a required question left alone is not owed,
    // because `patient.update` validates only the patch it is sent and holding
    // an unrelated correction hostage to it is what §7.8 exists to avoid.
    const owed = blank.length + Object.keys(malformed).length + (creating ? missing.length : cleared.length);

    // A required question this screen has no control for (§7.9). Intake cannot
    // succeed while one exists — `validateIntake` wants every active required
    // question answered, including the ones drawn read-only — so Save is refused
    // and the reason is named. Counting it in `owed` would be a lie: the number
    // there is what the desk can still go and do, and this is not.
    const locale = useLocale();
    const unaskable = creating ? unaskableRequired(questions.data ?? []) : [];

    const change = (patch: Partial<PatientForm>) =>
        setForm((current) => (current ? { ...current, ...patch } : current));

    const answer = (key: string, value: string) =>
        setForm((current) =>
            current ? { ...current, answers: { ...current.answers, [key]: value } } : current,
        );

    // Everything that could refuse a save is already visible — a `due` label on
    // each thing still owed and the count on the button — so this only has to
    // not fire, never to explain itself after the fact.
    const onSave = async () => {
        if (!form || !initial || owed > 0 || unaskable.length > 0) return;

        if (creating) {
            const input = createInputOf(form, editable);
            if (input === null) return;
            const saved = await create.mutate(input);
            if (!saved) return;
            onSaved(saved.id);
            return;
        }

        const patch = updateInputOf(patientId, form, initial, editable);
        if (patch === null) return;
        // Nothing moved. Closing beats spending a round trip to write the record
        // back over itself.
        if (isUnchanged(patch)) {
            onSaved(patientId);
            return;
        }

        const saved = await update.mutate(patch);
        if (!saved) return;
        onSaved(patientId);
    };

    return (
        <View style={styles.screen}>
            <EditBar
                title={creating ? 'New patient' : 'Edit patient'}
                onCancel={save.pending ? undefined : onCancel}
            />

            {loading && !form ? (
                <SkeletonRows count={5} gutter={size.gutter} />
            ) : failed && !form ? (
                <EmptyState
                    title={creating ? 'Could not open the form' : 'Could not open this record'}
                    body={errorText(failed)}
                    actionLabel="Try again"
                    onAction={() => {
                        questions.refetch();
                        record.refetch();
                    }}
                    weight="panel"
                />
            ) : form ? (
                <>
                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        showsVerticalScrollIndicator={false}
                    >
                        {save.error !== undefined && (
                            <View style={styles.callout}>
                                <Callout tone="warning" title="Not saved">
                                    {errorText(save.error)}
                                </Callout>
                            </View>
                        )}

                        {unaskable.length > 0 && (
                            <View style={styles.callout}>
                                <Callout tone="warning" title="This form cannot be completed">
                                    {`${unaskable.map((question) => resolveLabel(question, locale)).join(', ')} ${
                                        unaskable.length === 1 ? 'is' : 'are'
                                    } required, and cannot be answered here yet. Make ${
                                        unaskable.length === 1 ? 'it' : 'them'
                                    } optional in Settings to register someone.`}
                                </Callout>
                            </View>
                        )}

                        <Text variant="eyebrow" tone="muted" style={styles.eyebrow}>
                            BASICS
                        </Text>

                        <BasicsCard form={form} onChange={change} blank={blank} errors={malformed} />

                        <Questions
                            questions={editable}
                            readOnly={readOnly}
                            stored={record.data?.patient.custom ?? {}}
                            form={form}
                            answered={answered}
                            missing={missing}
                            onAnswer={answer}
                            loading={questions.loading && !questions.data}
                            error={questions.error}
                        />
                    </ScrollView>

                    <SaveBar
                        label={owed > 0 ? `${owed} required left` : 'Save patient'}
                        disabled={owed > 0 || unaskable.length > 0}
                        pending={save.pending}
                        onPress={onSave}
                    />
                </>
            ) : null}
        </View>
    );
}

/**
 * The design's bar: the round cancel cross and the title beside it, left
 * aligned. Not a centred `ui/TopBar` title — the cross is the only other thing
 * on the line, and centring the words against it puts the screen's name
 * off-centre from everything below it.
 *
 * Cancel goes missing rather than greying out while a save is in flight, which
 * is what the record's back already does: the write is the one thing on screen
 * and abandoning it halfway is the outcome the sheet was built to prevent.
 */
function EditBar({ title, onCancel }: { title: string; onCancel?: () => void }) {
    return (
        <View style={styles.bar}>
            {onCancel ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                    onPress={onCancel}
                    hitSlop={10}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                    testID="patient-edit-cancel"
                >
                    <CloseIcon size={15} stroke={color.ink} />
                </Pressable>
            ) : (
                <View style={styles.iconButton} />
            )}

            <Text variant="headline" accessibilityRole="header">
                {title}
            </Text>
        </View>
    );
}

type QuestionsProps = {
    questions: CustomQuestion[];
    readOnly: CustomQuestion[];
    stored: Record<string, unknown>;
    form: PatientForm;
    answered: number;
    missing: string[];
    onAnswer: (key: string, value: string) => void;
    loading: boolean;
    error?: Error;
};

/**
 * The clinic's questions, under the count and the bar the design draws across
 * them. The bar is progress through the questionnaire and not through the form:
 * the four basics are always four, so folding them in would make every new
 * patient start at 40% for facts they have not given yet.
 */
function Questions({
    questions,
    readOnly,
    stored,
    form,
    answered,
    missing,
    onAnswer,
    loading,
    error,
}: QuestionsProps) {
    const missingKeys = useMemo(() => new Set(missing), [missing]);
    const total = questions.length;

    if (loading) {
        return (
            <View style={styles.section}>
                <SkeletonRows count={3} gutter={0} />
            </View>
        );
    }

    if (error && total === 0) {
        return (
            <View style={styles.section}>
                <EmptyState
                    title="Could not load the clinic's questions"
                    body={errorText(error)}
                    weight="line"
                />
            </View>
        );
    }

    if (total === 0 && readOnly.length === 0) {
        return (
            <View style={styles.section}>
                <EmptyState
                    title="No questions set up"
                    body="Questions the clinic adds in settings appear here for every patient."
                    weight="line"
                />
            </View>
        );
    }

    return (
        <View style={styles.section}>
            <View style={styles.sectionHead}>
                <Text variant="eyebrow" tone="muted">
                    CLINIC QUESTIONS
                </Text>
                <Text variant="caption" weight="medium" tone="muted">
                    {`${answered} of ${total} answered`}
                </Text>
            </View>

            <Progress
                value={total === 0 ? 0 : answered / total}
                label={`${answered} of ${total} questions answered`}
            />

            <View style={styles.questions}>
                {questions.map((question) => (
                    <AnswerEditor
                        key={question.key}
                        question={question}
                        value={form.answers[question.key] ?? ''}
                        onChange={(value) => onAnswer(question.key, value)}
                        missing={missingKeys.has(question.key)}
                    />
                ))}

                {readOnly.map((question) => (
                    <ReadOnlyAnswer
                        key={question.key}
                        question={question}
                        shown={displayAnswer(question, stored[question.key])}
                    />
                ))}
            </View>

            <Text variant="caption" tone="muted" style={styles.footnote}>
                Answers are kept on the record. Nothing here is ever deleted — a question the clinic stops
                asking keeps its answer and stops showing.
            </Text>
        </View>
    );
}

/**
 * The questionnaire's progress. Drawn here rather than with `ui/ProgressBar`
 * for one reason: its light track is `surface2` (#f0f0f3), which on this
 * screen's `canvas` (#f4f4f6) is a four-value difference and vanishes. An empty
 * bar has to be visible — at `0 of 4` the track *is* the whole control, and the
 * design draws it a clear step darker than the page. See BLOCKED.md.
 */
function Progress({ value, label }: { value: number; label: string }) {
    const width = `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%` as const;

    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel={label}
            accessibilityValue={{ now: Math.round(value * 100), min: 0, max: 100 }}
            style={styles.track}
        >
            <View style={[styles.fill, { width }]} />
        </View>
    );
}

/**
 * The design's footer: the page's own ground, a hairline above it, and one
 * full-width button. `ui/ActionBar` is the same shape on a white bar with a
 * pill button; this screen draws neither.
 *
 * The button is local for the same reason the bar is — `ui/Button` renders
 * `disabled` as `opacity: 0.32` over its `ink` fill, which turns a white label
 * into grey-on-grey and makes `3 required left` the least readable thing on
 * screen, exactly when it is the thing the desk needs to read. The design says
 * it plainly: a pale fill and dark type, inert but legible. The press lock is
 * `Button`'s, kept because a double-tapped Save registers two patients.
 */
function SaveBar({
    label,
    disabled,
    pending,
    onPress,
}: {
    label: string;
    disabled: boolean;
    pending: boolean;
    onPress: () => void;
}) {
    const lockedUntil = useRef(0);
    const inert = disabled || pending;

    function press() {
        if (inert) return;
        const now = Date.now();
        if (now < lockedUntil.current) return;
        lockedUntil.current = now + 500;
        onPress();
    }

    return (
        <View style={styles.saveBar}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: inert, busy: pending }}
                disabled={inert}
                onPress={press}
                style={({ pressed }) => [
                    styles.save,
                    inert ? styles.saveOff : styles.saveOn,
                    pressed && styles.pressed,
                ]}
                testID="patient-save"
            >
                {pending ? <ActivityIndicator size="small" color={color.muted} /> : null}
                <Text variant="callout" weight="semibold" tone={inert ? 'muted' : 'inverse'}>
                    {pending ? 'Saving…' : label}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    // The scroll takes the room the bar and the footer leave, so the footer stays
    // on the bottom edge of a short form instead of riding under its last field.
    scroll: { flex: 1 },
    content: { paddingHorizontal: size.gutter, paddingTop: space[1], paddingBottom: space[6] },

    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingTop: space[2],
        paddingBottom: space[3],
    },
    iconButton: {
        width: 34,
        height: 34,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surface,
        borderWidth: border.hair,
        borderColor: color.line,
    },
    pressed: { opacity: 0.6 },

    callout: { paddingBottom: space[3] },
    eyebrow: { paddingBottom: space[1.5] },

    section: { paddingTop: space[4] },
    sectionHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[2.5],
        paddingBottom: space[1.5],
    },
    questions: { paddingTop: space[1] },
    footnote: { paddingTop: space[3] },

    // A clear step darker than the page, so an empty bar still reads as a bar.
    track: { height: 3, borderRadius: radius.full, backgroundColor: color.outline, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: radius.full, backgroundColor: color.accent },

    // No `size.nav` clearance and no home-indicator padding: `AppShell` draws
    // the tab bar in flow *below* this, so the bar already carries the bottom
    // inset and anything added here is dead grey between the two.
    saveBar: {
        paddingHorizontal: size.gutter,
        paddingVertical: space[3],
        borderTopWidth: border.hair,
        borderTopColor: color.line,
        backgroundColor: color.canvas,
    },
    save: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        alignSelf: 'stretch',
        // Taller than `ui/Button`'s `md`: the design draws 15px of padding around
        // the label, and this is the one thing the screen exists to commit.
        minHeight: size.control,
        borderRadius: radius.lg,
    },
    saveOn: { backgroundColor: color.ink },
    saveOff: { backgroundColor: color.surface2 },
});
