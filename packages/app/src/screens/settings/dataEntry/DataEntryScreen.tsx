/**
 * Settings → Data entry. The screen the old system's register is retyped into.
 *
 * Everything about it is bent toward one motion repeated a few hundred times:
 * read a row off another screen, type it, commit it, get an empty form back.
 * So the form never navigates — a save clears the fields and puts the caret
 * back at the top of them, and the pane stays exactly where it was. The count above
 * the form is the only thing that moves, which is the point of it: hours of
 * this with nothing changing on screen is hours of not knowing whether it is
 * working.
 *
 * Keyboard-first, on `ui/TextField` and `ui/NumericField`. They forward a ref
 * now, which is the one thing this screen could not do without: the caret has to
 * move between fields and back to the top after a save, and a form the desk has
 * to reach up and tap into between every row is the whole problem. `ui/Field`'s
 * `layout="inline"` is the rhythm `patient-edit.html` draws for the same four
 * facts — label on the start edge, the answer against it — which is why the
 * card no longer rules its own rows: the underlined control is the rule.
 *
 * The first field takes the return key as `next`; the last takes it as `done`
 * and commits. Nothing has to be tapped to enter a patient. The order itself is
 * `ENTRY_ORDER`, in `entryForm.ts`, because `bun test` has no renderer and the
 * caret is the feature.
 *
 * ## Duplicates
 *
 * Looked up on the number, once it has stopped changing. Not a refusal — two
 * siblings share a mother's number and the desk is the only thing that can tell
 * that apart from the same row typed twice — so it is a warning with a
 * checkbox, and Save will not fire until the checkbox is ticked. Over a session
 * this long the second copy is otherwise only ever found months later, by a
 * balance being wrong.
 *
 * ## The cutoff
 *
 * A balance needs a branch and a date to hang on, both set once at the top and
 * kept for the session. They are collapsed out of the way after the first save,
 * because they are answered once and the form below them is answered four
 * hundred times.
 *
 * ## No design
 *
 * There is no mockup for this screen — the Open Design folder has fourteen and
 * none of them is this. Built from the tokens and from the card `patient-edit`
 * settles, and recorded in DECISIONS.md rather than passed off as drawn.
 */
import { offsetForDate, todayKey } from '@lustre/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInput, View } from 'react-native';
import { trpcClient, useTRPC } from '../../../api';
import { formatMoney } from '../../../components/domain';
import {
    ActionBar,
    Callout,
    Card,
    Field,
    NumericField,
    SectionLabel,
    Select,
    TextField,
    Toast,
} from '../../../components/ui';
import { border, color, radius, space, Text } from '../../../theme';
import { Pane } from '../components/Pane';
import { ErrorState, SkeletonRows } from '../components/QueryStates';
import { errorText } from '../data/errors';
import type { CaretField, Cutoff, EntryForm, Session } from './entryForm';
import {
    ageDigits,
    balanceDigits,
    balancePiastres,
    blankFields,
    blocks,
    cutoffDigits,
    cutoffDigitsOf,
    cutoffDisplay,
    cutoffError,
    cutoffIso,
    EMPTY_SESSION,
    emptyForm,
    enterInputOf,
    FEMALE,
    FIRST_FIELD,
    focusField,
    MALE,
    malformedFields,
    nextField,
    phoneDigits,
    recorded,
} from './entryForm';

/** Long enough that a number is finished being typed, short enough to land before the save. */
const DUPLICATE_DELAY_MS = 400;

/** Only what the duplicate warning draws. The whole patient is more than the line needs. */
type PhoneMatch = { id: string; name: string };

/**
 * What a failure says at the desk. Four codes mean something specific during a
 * migration session, and the general sentence for them is not good enough:
 * the row is still on screen, and saying so is the difference between retyping
 * it and not.
 */
const ENTRY_ERRORS = {
    INVALID_PHONE: 'That phone number was not accepted. Check it and try again.',
    INVALID_AMOUNT: 'That balance is outside what the system will hold. Check it and try again.',
    NOT_FOUND: 'That branch is no longer set up. Pick another one above.',
    VALIDATION: 'Something in the row was not accepted. Check it and try again.',
} as const;

export function DataEntryScreen({ onBack }: { onBack: () => void }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    // Active branches only — a balance is dated at a branch that still exists.
    const branches = useQuery(trpc.branch.list.queryOptions({ includeInactive: false }));
    const progress = useQuery(trpc.migration.progress.queryOptions());
    const save = useMutation(
        trpc.migration.enter.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries(trpc.migration.pathFilter());
                void queryClient.invalidateQueries(trpc.patient.pathFilter());
            },
        }),
    );

    const [form, setForm] = useState<EntryForm>(emptyForm);
    const [session, setSession] = useState<Session>(EMPTY_SESSION);
    const [branchId, setBranchId] = useState<string | null>(null);
    const [dateDigits, setDateDigits] = useState(() => cutoffDigitsOf(todayKey()));
    const [duplicates, setDuplicates] = useState<PhoneMatch[]>([]);
    const [acknowledged, setAcknowledged] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const legacyRef = useRef<TextInput>(null);
    const name = useRef<TextInput>(null);
    const phone = useRef<TextInput>(null);
    const age = useRef<TextInput>(null);
    const balance = useRef<TextInput>(null);

    // Read at the moment the caret moves rather than at render, so the first
    // Return after a mount lands on a field that is actually attached.
    function goTo(field: CaretField | null) {
        focusField(
            {
                legacyRef: legacyRef.current,
                name: name.current,
                phone: phone.current,
                age: age.current,
                balance: balance.current,
            },
            field,
        );
    }

    // The lookup is per number, and a number is retyped faster than Tailscale
    // answers — so a late reply for a number that has since changed is dropped
    // rather than warning about somebody else's record.
    const lookup = useRef<ReturnType<typeof setTimeout>>(undefined);
    const asked = useRef('');

    const dateIso = cutoffIso(dateDigits);
    const cutoff: Cutoff | null =
        branchId && dateIso ? { branchId, date: dateIso, offsetMinutes: offsetForDate(dateIso) } : null;

    const state = { duplicates: duplicates.length, acknowledged, cutoff };
    const owed = blocks(form, state);
    const blank = blankFields(form);
    const malformed = malformedFields(form);

    // The cutoff is answered once and the form below it four hundred times, so
    // it folds away as soon as the first row proves it is right.
    const [cutoffOpen, setCutoffOpen] = useState(true);
    const showCutoff = cutoffOpen || session.entered === 0;

    function change(patch: Partial<EntryForm>) {
        setForm((current) => ({ ...current, ...patch }));
    }

    function changePhone(text: string) {
        const next = phoneDigits(text);
        change({ phone: next });
        setAcknowledged(false);

        clearTimeout(lookup.current);
        if (next.trim().length < 5) {
            setDuplicates([]);
            return;
        }

        lookup.current = setTimeout(() => {
            asked.current = next;
            trpcClient.patient.byPhone
                .query({ phone: next })
                .then((found) => {
                    if (asked.current !== next) return;
                    setDuplicates(found.map((row) => ({ id: row.id, name: row.name })));
                })
                // A duplicate check that cannot reach the server is not a
                // reason to stop typing. The save below reports its own
                // failure, which is the one that matters.
                .catch(() => setDuplicates([]));
        }, DUPLICATE_DELAY_MS);
    }

    function commit() {
        const input = enterInputOf(form, state);
        if (input === null) return;

        save.mutate(input, {
            onSuccess: () => {
                const carried = balancePiastres(form.balance);
                setSession((current) => recorded(current, carried));
                setForm(emptyForm());
                setDuplicates([]);
                setAcknowledged(false);
                setCutoffOpen(false);
                setToast(`${input.name} entered`);

                // Straight back to the top of an empty form. This is the whole
                // reason the `ui/` fields had to forward a ref.
                goTo(FIRST_FIELD);
            },
        });
    }

    const branchOptions = useMemo(
        () => (branches.data ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
        [branches.data],
    );

    const loading = branches.isLoading;

    return (
        <Pane
            title="Data entry"
            subtitle="Bulk entry from the old system"
            onBack={save.isPending ? () => {} : onBack}
            testID="settings-data-entry"
            overlay={
                <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
            }
            footer={
                branches.data ? (
                    <ActionBar
                        primaryLabel={saveLabel(owed, save.isPending)}
                        onPrimary={commit}
                        primaryLoading={save.isPending}
                        primaryDisabled={owed.length > 0}
                        testID="data-entry-save"
                    />
                ) : undefined
            }
        >
            {loading ? <SkeletonRows count={3} /> : null}

            {branches.error ? (
                <ErrorState
                    message={errorText(branches.error)}
                    onRetry={branches.refetch}
                    retrying={branches.isFetching}
                />
            ) : null}

            {branches.data ? (
                <>
                    <Tally session={session} total={progress.data?.patients} />

                    {save.error ? (
                        <Callout tone="warning" title="Not saved">
                            {errorText(save.error, ENTRY_ERRORS)}
                        </Callout>
                    ) : null}

                    {showCutoff ? (
                        <CutoffCard
                            options={branchOptions}
                            branchId={branchId}
                            onBranch={setBranchId}
                            digits={dateDigits}
                            onDigits={(text) => setDateDigits(cutoffDigits(text))}
                            error={cutoffError(dateDigits) ?? undefined}
                            onDone={() => setCutoffOpen(false)}
                            closeable={session.entered > 0}
                        />
                    ) : (
                        <CutoffSummary
                            branch={branchOptions.find((b) => b.value === branchId)?.label}
                            date={dateIso === null ? null : cutoffDisplay(dateDigits)}
                            onOpen={() => setCutoffOpen(true)}
                        />
                    )}

                    <SectionLabel inset={false}>PATIENT</SectionLabel>

                    <Card padded style={styles.entry}>
                        {/* First, because it is the number on the front of the
                            file she is holding — she reads it before she reads
                            the name. Optional: a file with no number on it is
                            still a patient. */}
                        <TextField
                            ref={legacyRef}
                            label="Old ref"
                            layout="inline"
                            inline
                            accessibilityLabel="The old system's reference"
                            value={form.legacyRef}
                            onChangeText={(text) => change({ legacyRef: text })}
                            onSubmitEditing={() => goTo(nextField('legacyRef'))}
                            returnKeyType="next"
                            submitBehavior="submit"
                            autoCapitalize="characters"
                            autoCorrect={false}
                            placeholder="As written on the file"
                            testID="entry-legacy-ref"
                        />

                        <TextField
                            ref={name}
                            label="Full name"
                            layout="inline"
                            inline
                            due={blank.includes('name')}
                            accessibilityLabel="Full name"
                            value={form.name}
                            onChangeText={(text) => change({ name: text })}
                            onSubmitEditing={() => goTo(nextField('name'))}
                            returnKeyType="next"
                            submitBehavior="submit"
                            autoCapitalize="words"
                            autoCorrect={false}
                            placeholder="As it is on the old system"
                            testID="entry-name"
                        />

                        <TextField
                            ref={phone}
                            label="Phone"
                            layout="inline"
                            inline
                            due={blank.includes('phone')}
                            error={malformed.phone}
                            accessibilityLabel="Phone"
                            value={form.phone}
                            onChangeText={changePhone}
                            onSubmitEditing={() => goTo(nextField('phone'))}
                            returnKeyType="next"
                            submitBehavior="submit"
                            keyboardType="phone-pad"
                            placeholder="01xx xxx xxxx"
                            testID="entry-phone"
                        />

                        {/* Both on one line, because age and sex are the two
                            things read off the file in one breath. The label is
                            the row's, so the age field carries none of its own. */}
                        <Field label="Age · sex" layout="inline" error={malformed.age}>
                            <View style={styles.ageSex}>
                                <View style={styles.age}>
                                    <NumericField
                                        ref={age}
                                        variant="inline"
                                        size="body"
                                        accessibilityLabel="Age"
                                        value={form.age}
                                        onChangeText={(text) => change({ age: ageDigits(text) })}
                                        onSubmitEditing={() => goTo(nextField('age'))}
                                        returnKeyType="next"
                                        submitBehavior="submit"
                                        keyboardType="number-pad"
                                        placeholder="—"
                                        testID="entry-age"
                                    />
                                </View>

                                <SexToggle value={form.gender} onChange={(gender) => change({ gender })} />
                            </View>
                        </Field>

                        {/* The last field, so the return key commits the row —
                            the desk never has to reach for the button.

                            `number-pad`, not the field's default `decimal-pad`:
                            `balanceDigits` strips a separator, so `12.50` typed
                            here would be read as 1250 pounds. A keypad with no
                            decimal key is what stops that being typed at all. */}
                        <NumericField
                            ref={balance}
                            label="Owed"
                            layout="inline"
                            variant="inline"
                            size="amount"
                            prefix="EGP"
                            error={malformed.balance}
                            accessibilityLabel="Owed at the cutoff, in pounds"
                            value={form.balance}
                            onChangeText={(text) => change({ balance: balanceDigits(text) })}
                            onSubmitEditing={commit}
                            returnKeyType="done"
                            keyboardType="number-pad"
                            placeholder="Nothing owed"
                            testID="entry-balance"
                        />
                    </Card>

                    <DuplicateWarning
                        matches={duplicates}
                        acknowledged={acknowledged}
                        onAcknowledge={() => setAcknowledged((current) => !current)}
                    />

                    {owed.includes('cutoff') ? (
                        <Callout tone="warning" title="No cutoff set">
                            A balance has to be dated. Set the branch and the cutoff date above, or leave the
                            amount blank.
                        </Callout>
                    ) : null}

                    <Text variant="caption" tone="muted">
                        Questions the clinic asks are not asked here — they are answered at the desk the next
                        time this patient is in. Only future appointments and current balances move across;
                        past visits stay in the old system.
                    </Text>
                </>
            ) : null}
        </Pane>
    );
}

function saveLabel(owed: string[], pending: boolean): string {
    if (pending) return 'Saving';
    if (owed.includes('duplicate')) return 'Already on file';
    if (owed.length > 0) return `${owed.length} to fill in`;
    return 'Enter and next';
}

/**
 * How far she has got. The session count is the one that answers the question
 * she is actually asking — the register's total is there so a morning's work
 * can be checked against the old system's own count at the end.
 */
function Tally({ session, total }: { session: Session; total?: number }) {
    return (
        <View style={styles.tally}>
            <View style={styles.tallyMain}>
                <Text variant="figure" script="mono" testID="entry-session-count">
                    {String(session.entered)}
                </Text>
                <Text variant="footnote" tone="muted">
                    entered this session
                </Text>
            </View>

            <View style={styles.tallySide}>
                {session.carried > 0 ? (
                    <Text variant="caption" tone="muted">
                        {`${session.carried} with a balance · ${formatMoney(session.carriedTotal)}`}
                    </Text>
                ) : null}
                {total !== undefined ? (
                    <Text variant="caption" tone="muted">
                        {`${total} on file altogether`}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

function CutoffCard({
    options,
    branchId,
    onBranch,
    digits,
    onDigits,
    error,
    onDone,
    closeable,
}: {
    options: { value: string; label: string }[];
    branchId: string | null;
    onBranch: (id: string) => void;
    digits: string;
    onDigits: (text: string) => void;
    error?: string;
    onDone: () => void;
    closeable: boolean;
}) {
    return (
        <View style={styles.group}>
            <SectionLabel inset={false}>BALANCES AS OF</SectionLabel>

            <Card padded style={styles.cutoff}>
                <Select
                    label="Branch"
                    options={options}
                    value={branchId}
                    onChange={onBranch}
                    placeholder="Pick a branch"
                    sheetTitle="Branch"
                    testID="entry-branch"
                />

                <NumericField
                    label="Cutoff date"
                    variant="end"
                    size="body"
                    error={error}
                    accessibilityLabel="Cutoff date"
                    value={cutoffDisplay(digits)}
                    onChangeText={onDigits}
                    keyboardType="number-pad"
                    placeholder="DD / MM / YYYY"
                    testID="entry-cutoff"
                />

                <Text variant="caption" tone="muted">
                    The day the old system stopped being the truth. Balances are dated here, and nothing about
                    them shows up in the day's takings.
                </Text>

                {closeable ? (
                    <Pressable
                        accessibilityRole="button"
                        onPress={onDone}
                        style={({ pressed }) => [styles.done, pressed && styles.pressed]}
                    >
                        <Text variant="footnote" weight="semibold" tone="accent">
                            Done
                        </Text>
                    </Pressable>
                ) : null}
            </Card>
        </View>
    );
}

function CutoffSummary({
    branch,
    date,
    onOpen,
}: {
    branch?: string;
    /** The cutoff as the field above shows it, or null while it is not a date yet. */
    date: string | null;
    onOpen: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change the branch and cutoff date"
            onPress={onOpen}
            style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
            testID="entry-cutoff-summary"
        >
            <Text variant="caption" tone="muted">
                {branch && date ? `Balances as of ${date} · ${branch}` : 'No cutoff set — balances off'}
            </Text>
            <Text variant="caption" weight="semibold" tone="accent">
                Change
            </Text>
        </Pressable>
    );
}

/**
 * Somebody is already on file under this number. Named rather than counted: the
 * desk recognises "Nour Sobhy" as the sibling and "Nour Sobhy" again as the row
 * they typed ten minutes ago, and no count can tell them apart.
 */
function DuplicateWarning({
    matches,
    acknowledged,
    onAcknowledge,
}: {
    matches: PhoneMatch[];
    acknowledged: boolean;
    onAcknowledge: () => void;
}) {
    if (matches.length === 0) return null;

    return (
        <Callout tone="warning" title="This number is already on file">
            <View style={styles.duplicates}>
                <Text variant="footnote" tone="ink2">
                    {matches.map((match) => match.name).join(', ')}
                </Text>

                <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: acknowledged }}
                    accessibilityLabel="This is a different patient"
                    onPress={onAcknowledge}
                    style={({ pressed }) => [styles.check, pressed && styles.pressed]}
                    testID="entry-duplicate-ack"
                >
                    <View style={[styles.box, acknowledged && styles.boxOn]}>
                        {acknowledged ? (
                            <Text variant="caption" weight="semibold" tone="inverse">
                                ✓
                            </Text>
                        ) : null}
                    </View>
                    <Text variant="footnote">This is a different patient</Text>
                </Pressable>
            </View>
        </Callout>
    );
}

/** `BasicsCard`'s toggle, and its third state: nobody recorded a sex. */
function SexToggle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Sex">
            <Half
                label="F"
                selected={value === FEMALE}
                onPress={() => onChange(value === FEMALE ? '' : FEMALE)}
            />
            <Half label="M" selected={value === MALE} onPress={() => onChange(value === MALE ? '' : MALE)} />
        </View>
    );
}

function Half({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label === 'F' ? 'Female' : 'Male'}
            onPress={onPress}
            style={({ pressed }) => [styles.half, selected && styles.halfOn, pressed && styles.pressed]}
            testID={`entry-sex-${label}`}
        >
            <Text variant="footnote" weight="semibold" tone={selected ? 'inverse' : 'muted'}>
                {label}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    group: { gap: space[2] },
    cutoff: { gap: space[4] },

    tally: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: space[3],
    },
    tallyMain: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
    tallySide: { alignItems: 'flex-end', gap: space[0.5] },

    entry: { gap: space[1] },
    ageSex: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    age: { minWidth: 34, justifyContent: 'center' },

    done: { alignSelf: 'flex-start' },

    summary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
        borderRadius: radius.lg,
        backgroundColor: color.surface2,
    },

    duplicates: { gap: space[2.5] },
    check: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    box: {
        width: 20,
        height: 20,
        borderRadius: radius.sm,
        borderWidth: border.hair,
        borderColor: color.outline,
        backgroundColor: color.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    boxOn: { backgroundColor: color.ink, borderColor: color.ink },

    toggle: { flexDirection: 'row', padding: 3, borderRadius: radius.full, backgroundColor: color.surface2 },
    half: {
        minWidth: 34,
        paddingHorizontal: space[3],
        paddingVertical: space[1.5],
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    halfOn: { backgroundColor: color.ink },
    pressed: { opacity: 0.6 },
});
