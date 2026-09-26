// Registering a patient and correcting one — `patient-edit.html`, followed
// structurally: the cancel cross and the title, BASICS as one card of four
// ruled rows, then the clinic's questions under a label that counts them and a
// progress bar across them, and the save pinned to the bottom over a hairline.
//
// One screen for both jobs because the design draws one, and one screen for
// both *kinds* of patient: an **Old patient** switch reveals the number on
// somebody's paper file and what they owed on it. Off by default and off sends nothing. It replaced a separate Settings →
// Data entry screen, whose one job was to be a second way to register the same
// person — and which numbered them a second time doing it.
//
// What differs between registering and correcting is
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
// Correcting the number a record is known by goes by its own call. It is gated
// by role and leaves an audit row, so the server gives it a procedure of its
// own. The
// row is drawn read-only for a role that may not edit, because the number is
// worth reading whoever is holding the phone, and it is absent entirely on a
// registration, where the counter hands it out. `canEditRef` is the same rule
// the server enforces; the screen asking it first is a correct screen, not the
// protection.
//
// An edit can therefore make two calls — ref, then patch — and the order is
// not arbitrary. See `onSave`.
//
// The write crosses Tailscale, so Save spins, cancel is disabled under it, and
// a failure keeps every field on screen with a `Callout` saying why.
//
// The footer clears the keyboard by padding its own floor, not by being
// translated. It used to rely on `adjustResize` shrinking the window around the
// keyboard, which stopped being true when `edgeToEdgeEnabled` arrived as the
// Expo SDK 54+ default: the app is laid out behind the IME, the window never
// gets shorter, and the footer sat under the keys with the last fields of the
// form. See `ui/useKeyboardHeight` for the whole of it.
import { canEditRef, resolveLabel } from '@lustre/shared';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
    Button,
    Callout,
    EmptyState,
    ProgressBar,
    SkeletonRows,
    Textarea,
    useKeyboardHeight,
} from '../../components/ui';
import { useLocale, useT } from '../../i18n';
import { useRole } from '../../shell/roleStore';
import { border, color, radius, size, space, Text } from '../../theme';
import { AnswerEditor, ReadOnlyAnswer } from './components/AnswerEditor';
import { BasicsCard } from './components/BasicsCard';
import { displayAnswer, isEditable } from './components/customFields';
import { CloseIcon } from './components/icons';
import { OldPatientRows } from './components/OldPatientCard';
import { patientsApi } from './data/api';
import { errorText } from './data/errors';
import { useMutation, useQuery } from './data/hooks';
import type { CustomQuestion, PatientDetail } from './data/types';
import type { PatientForm, PatientPrefill, PatientRequirements } from './patientForm';
import {
    answeredCount,
    blankBasics,
    blankOld,
    clearedRequired,
    createInputOf,
    emptyForm,
    formOf,
    isUnchanged,
    MAX_NOTES_LENGTH,
    malformedBasics,
    malformedOld,
    missingRequired,
    refBaselineOf,
    refEditError,
    refEditOf,
    saveFailureTitle,
    unaskableRequired,
    updateInputOf,
} from './patientForm';

export type PatientEditScreenProps = {
    /** Absent = registering someone new. Present = correcting the record it names. */
    patientId?: string;
    /**
     * What the list's search held when it came up empty, for a registration.
     * Read once, into the draft the screen starts from; ignored on an edit,
     * where the record is what the form starts from.
     */
    prefill?: PatientPrefill;
    onCancel: () => void;
    /**
     * A save is open. Cancel goes missing while one is, and the cluster above
     * holds the same line against a tab tap asking it to go home — leaving mid
     * write is the one thing this screen never does.
     */
    onSavingChange?: (saving: boolean) => void;
    /**
     * The patient that now exists, or the one that was just corrected.
     *
     * `basics` comes with a registration only. The booking flow carries on with
     * the patient it has just created and needs their name and number to say who
     * the booking is for; it has no record to read them from yet, and this screen
     * is holding the values it just sent. Correcting a record passes nothing —
     * the caller there already has the patient.
     */
    onSaved: (patientId: string, basics?: { name: string; phone: string }) => void;
};

export function PatientEditScreen({
    patientId,
    prefill,
    onCancel,
    onSavingChange,
    onSaved,
}: PatientEditScreenProps) {
    const t = useT();
    const creating = patientId === undefined;

    const questions = useQuery(['questions'], () => patientsApi.listQuestions());
    // Whether the clinic requires an age and a sex. The form is not drawn until
    // it is known, so a field is never marked due and then not.
    const requirements = useQuery(['requirements'], () => patientsApi.requirements());
    const record = useQuery(
        ['byId', patientId],
        (): Promise<PatientDetail | undefined> =>
            patientId === undefined ? Promise.resolve(undefined) : patientsApi.byId(patientId),
        { enabled: patientId !== undefined },
    );

    const create = useMutation(patientsApi.create);
    const update = useMutation(patientsApi.update);
    const editRef = useMutation(patientsApi.updateRef);
    const save = creating ? create : update;

    // Either can be the one that failed, and the callout says so for each. They
    // run in this order and each stops the save when it fails, and one that is
    // not sent is reset (below), so at most one holds an error.
    const saveError = editRef.error ?? save.error;
    const saving = save.pending || editRef.pending;

    // `hydrated` matters: the store falls back to secretary until storage
    // answers, and drawing an editable row for a beat and then taking it away
    // is worse than drawing the locked one a beat late.
    const { role, hydrated } = useRole();
    // Never on a registration — the counter hands out the number, so there is
    // nothing on screen to correct.
    const refMode = creating ? 'hidden' : hydrated && canEditRef(role) ? 'editable' : 'locked';

    // Only the kinds with a control. A `date` answer already on the record is
    // drawn below, read-only, and is never in the form.
    const editable = useMemo(() => (questions.data ?? []).filter(isEditable), [questions.data]);
    const readOnly = useMemo(
        () => (questions.data ?? []).filter((question) => !isEditable(question)),
        [questions.data],
    );

    const initial = useMemo<PatientForm | null>(() => {
        if (!questions.data || !requirements.data) return null;
        if (creating) return emptyForm(editable, prefill);
        return record.data ? formOf(record.data.patient, editable) : null;
    }, [creating, prefill, questions.data, requirements.data, record.data, editable]);

    // Seeded once and then left alone: this is a draft the desk is typing into,
    // and a re-read landing underneath it would take back what they wrote. The
    // null is what says "not seeded yet" — nothing ever sets it back, so the
    // condition cannot fire twice.
    const [form, setForm] = useState<PatientForm | null>(null);
    // The number this draft was seeded with, held the same way and for a
    // sharper reason. `initial` follows the record, so a refetch after somebody
    // else corrected the number would move it to theirs while the form still
    // holds the old one — and a Save pressed for an unrelated field would send
    // the old number back as a "correction", silently undoing theirs.
    const [seededRef, setSeededRef] = useState<string | null>(null);
    if (form === null && initial !== null) {
        setForm(initial);
        setSeededRef(initial.ref);
    }

    // The number that landed on an earlier attempt whose rest did not. Two
    // calls cannot be one transaction from here, so the screen says which half
    // is already on file rather than letting "Not saved" imply neither is.
    //
    // The value and not a flag: it becomes the baseline the ref is compared
    // against. A flag would skip the ref for the rest of the editor's life, so
    // a number changed *again* after a partial save would be dropped silently
    // while the patch went through and closed the screen.
    const [savedRef, setSavedRef] = useState<string | null>(null);
    const refBaseline = refBaselineOf(initial, seededRef, savedRef);

    const loading = questions.loading || requirements.loading || record.loading;
    const failed = questions.error ?? requirements.error ?? record.error;

    const requires: PatientRequirements | undefined = requirements.data;
    const blank = form && requires ? blankBasics(form, requires) : [];
    const malformed = form ? malformedBasics(form) : {};
    // Only on a registration: the switch is not drawn on an edit, so its fields
    // can never be owed there.
    const oldBlank = form && creating ? blankOld(form) : [];
    const oldMalformed = form && creating ? malformedOld(form) : {};
    const missing = form ? missingRequired(form, editable) : [];
    const answered = form ? answeredCount(form, editable) : 0;

    // Only the doctor's row can be wrong: every other role is reading a value it
    // cannot change, and marking it `due` would be telling them off for a
    // record they cannot correct here. And only a ref being *changed* is
    // judged — an old patient's number is their old system's and need not be
    // one this app would issue. See `refEditError`.
    const refMessage =
        form && refBaseline && refMode === 'editable'
            ? (refEditError(form, refBaseline) ?? undefined)
            : undefined;

    // A required answer the desk has emptied. Not the same as one never given:
    // the blank is in the patch, and the server throws on it rather than
    // deleting it, so the button has to refuse it here.
    const cleared = form && initial ? clearedRequired(form, initial, editable) : [];

    // The design's own arithmetic on the button: what is still owed before this
    // can be saved. On an edit that is the two facts a patient cannot be without
    // plus anything emptied — a required question left alone is not owed,
    // because `patient.update` validates only the patch it is sent and holding
    // an unrelated correction hostage to it is what §7.8 exists to avoid.
    const owed =
        blank.length +
        Object.keys(malformed).length +
        oldBlank.length +
        Object.keys(oldMalformed).length +
        (refMessage === undefined ? 0 : 1) +
        (creating ? missing.length : cleared.length);

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
        if (!form || !initial || !requires || owed > 0 || unaskable.length > 0) return;

        if (creating) {
            const input = createInputOf(form, editable, requires);
            if (input === null) return;
            onSavingChange?.(true);
            const saved = await create.mutate(input);
            onSavingChange?.(false);
            if (!saved) return;
            onSaved(saved.id, { name: input.name, phone: input.phone });
            return;
        }

        const patch = updateInputOf(patientId, form, initial, editable, requires);
        if (patch === null) return;

        // The number, if it moved from the last one on file — the record's, or
        // the one an earlier partial save already wrote. Its own call:
        // `patient.update` cannot write a ref, and this one is refused for a
        // role that may not.
        const ref = refMode === 'editable' && refBaseline ? refEditOf(form, refBaseline) : null;

        // Nothing moved. Closing beats spending a round trip to write the record
        // back over itself.
        if (isUnchanged(patch) && ref === null) {
            onSaved(patientId);
            return;
        }

        onSavingChange?.(true);

        // Ref, then patch — each stopping the save when it fails, so a retry has
        // only what is still owed left to send.
        //
        // The ref goes first because it is the one most likely to be refused —
        // a role, a number already taken, one not yet handed out — and the
        // number is usually what the desk opened this editor to correct. Writing
        // the rest and then refusing that would be a half-done save reported as
        // done; refused first, the record is left exactly as it was. Sending it
        // twice is harmless (an unchanged ref is a no-op server-side), but it is
        // still marked landed so a retry does not spend the call.
        //
        // A call this save is not making is reset: a failed earlier attempt
        // leaves its error behind, and the callout would otherwise show it over
        // a different call's failure.
        if (ref === null) {
            editRef.reset();
        } else {
            const moved = await editRef.mutate({ id: patientId, ref, editedBy: role });
            if (!moved) {
                onSavingChange?.(false);
                return;
            }
            setSavedRef(moved.ref);
        }

        if (!isUnchanged(patch)) {
            const saved = await update.mutate(patch);
            if (!saved) {
                onSavingChange?.(false);
                return;
            }
        }

        onSavingChange?.(false);
        onSaved(patientId);
    };

    return (
        <View style={styles.screen}>
            <EditBar
                title={creating ? 'New patient' : 'Edit patient'}
                onCancel={saving ? undefined : onCancel}
            />

            {loading && !form ? (
                <SkeletonRows count={5} gutter={size.gutter} ruled />
            ) : failed && !form ? (
                <EmptyState
                    title={creating ? 'Could not open the form' : 'Could not open this record'}
                    body={errorText(failed)}
                    actionLabel="Try again"
                    onAction={() => {
                        questions.refetch();
                        requirements.refetch();
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
                        {saveError !== undefined && (
                            <View style={styles.callout}>
                                <Callout
                                    tone="warning"
                                    title={saveFailureTitle(editRef.error !== undefined, savedRef !== null)}
                                >
                                    {errorText(saveError)}
                                </Callout>
                            </View>
                        )}

                        {unaskable.length > 0 && (
                            <View style={styles.callout}>
                                <Callout tone="warning" title="This form cannot be completed">
                                    {t(
                                        unaskable.length === 1
                                            ? '{questions} is required, and cannot be answered here yet. Make it optional in Settings to register someone.'
                                            : '{questions} are required, and cannot be answered here yet. Make them optional in Settings to register someone.',
                                        {
                                            questions: unaskable
                                                .map((question) => resolveLabel(question, locale))
                                                .join(locale === 'ar' ? '، ' : ', '),
                                        },
                                    )}
                                </Callout>
                            </View>
                        )}

                        <Text variant="eyebrow" tone="muted" style={styles.eyebrow}>
                            {t('BASICS')}
                        </Text>

                        {/* The old-patient switch is registration only. An
                            existing record is never registered again, and an
                            editor offering to give somebody an old number would
                            be offering to change the number already written on
                            their file. */}
                        <BasicsCard
                            form={form}
                            onChange={change}
                            blank={blank}
                            errors={malformed}
                            ref={refMode}
                            refError={refMessage}
                            trailing={
                                creating ? (
                                    <OldPatientRows
                                        form={form}
                                        onChange={change}
                                        blank={oldBlank}
                                        errors={oldMalformed}
                                    />
                                ) : null
                            }
                        />

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

                        {/* The patient's own notes, and the one place they are
                            written: not a visit's or a booking's, which stay on
                            those. Last, because they are whatever the rows above
                            had no place for. */}
                        <View style={styles.section}>
                            <Text variant="eyebrow" tone="muted" style={styles.eyebrow}>
                                {t('NOTES')}
                            </Text>
                            <Textarea
                                accessibilityLabel={t('Patient notes')}
                                placeholder="Anything the clinic should know"
                                value={form.notes}
                                onChangeText={(notes) => change({ notes })}
                                maxLength={MAX_NOTES_LENGTH}
                                editable={!saving}
                                testID="patient-notes-input"
                            />
                        </View>
                    </ScrollView>

                    <SaveBar
                        label={owed > 0 ? t('{count} required left', { count: owed }) : 'Save patient'}
                        disabled={owed > 0 || unaskable.length > 0}
                        pending={saving}
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
    const t = useT();
    const missingKeys = useMemo(() => new Set(missing), [missing]);
    const total = questions.length;

    if (loading) {
        return (
            <View style={styles.section}>
                <SkeletonRows count={3} gutter={0} ruled />
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
                    {t('CLINIC QUESTIONS')}
                </Text>
                <Text variant="caption" weight="medium" tone="muted">
                    {t('{answered} of {total} answered', { answered, total })}
                </Text>
            </View>

            <ProgressBar
                value={total === 0 ? 0 : answered / total}
                accessibilityLabel={t('{answered} of {total} questions answered', { answered, total })}
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
                {t(
                    'Answers are kept on the record. Nothing here is ever deleted — a question the clinic stops asking keeps its answer and stops showing.',
                )}
            </Text>
        </View>
    );
}

/**
 * The design's footer: the page's own ground, a hairline above it, and one
 * full-width button. `ui/ActionBar` is the same shape on a white bar with a
 * pill button; this screen draws neither, which is why the bar is still local
 * and the button inside it is `size="md"` — `lg` is the pill.
 *
 * The button itself was local too, on the grounds that `ui/Button` faded a
 * disabled `primary` to `opacity: 0.32` and took `3 required left` — the
 * sentence that says how to bring Save back — down with the fill. That was true
 * and was fixed in PR #33: `disabled` is now two colours, `surface2` under
 * `muted`, which is the pale fill and dark type the design asks for. `loading`
 * and the 500ms press lock came with it, and a double-tapped Save registering
 * two patients is exactly what the lock is for.
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
    const keyboard = useKeyboardHeight();

    return (
        <View style={[styles.saveBar, { paddingBottom: Math.max(space[3], keyboard) }]}>
            <Button
                label={pending ? 'Saving…' : label}
                onPress={onPress}
                size="md"
                loading={pending}
                disabled={disabled}
                block
                style={styles.save}
                testID="patient-save"
            />
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

    // No `size.nav` clearance and no home-indicator padding: `AppShell` draws
    // the tab bar in flow *below* this, so the bar already carries the bottom
    // inset and anything added here is dead grey between the two.
    saveBar: {
        paddingHorizontal: size.gutter,
        // `paddingBottom` is supplied inline — it carries the keyboard.
        paddingTop: space[3],
        borderTopWidth: border.hair,
        borderTopColor: color.line,
        backgroundColor: color.canvas,
    },
    // Taller than `md`'s `size.row`: the design draws 15px of padding around the
    // label, and this is the one thing the screen exists to commit. The radius
    // is `md`'s own — `lg` would make it a pill, which this footer is not.
    save: { minHeight: size.control },
});
