// One patient — `patient-view.html`, followed structurally: a bar that says
// only where you are, the name at the size a name deserves with the two ways to
// reach them beside it, the two things you start from here, the balance, then
// the history or the clinic's questions.
//
// Layout notes that are the design's and not defaults: the history is
// full-bleed with hairlines, not cards — a record is a ledger and the rows want
// to run edge to edge under a year band. The balance strip is a hairline row,
// not a filled panel: it is a fact about the patient, not an alert. The Details
// tab is the clinic's questions and nothing else; sex and age live in the meta
// line under the name, so a second card repeating them was this screen's
// invention, not the design's.
//
// `patient.byId` is one payload — patient, history and `questionnaireGaps` — so
// the record is a single round trip and what it is missing is answered by the
// server. The history is over appointments, not visits: a no-show and a
// cancellation never produce a visit and are exactly what a record is opened to
// check. The tab counts the rows that became visits, so a booking for next
// month is not a visit already made.
//
// Nothing about any clinic's questionnaire is written down here; a second
// clinic's different list renders the same way. Gaps are recomputed by the
// server, so a record that just stopped being a gap is re-read rather than
// patched locally. Back is disabled while a write is open so an edit is never
// abandoned mid-flight. The toast is a child of the screen root, not the scroll
// view — it also carries the failure when WhatsApp or the dialler will not open.
// History groups by the parsed date's local year, not the ISO prefix — an
// evening visit on 31 December is UTC 1 January and would sit under the wrong
// heading. Answers to deactivated questions are hidden but still on the record
// (§7.8).
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MoneyValue } from '../../components/domain';
import {
    Banner,
    Button,
    Callout,
    Chevron,
    EmptyState,
    RefreshView,
    SegmentedControl,
    SkeletonRows,
    Toast,
    usePullToRefresh,
} from '../../components/ui';
import { border, color, radius, size, space, Text } from '../../theme';
import { CustomAnswerRow } from './components/CustomAnswerRow';
import { HistoryRow } from './components/HistoryRow';
import { EditIcon } from './components/icons';
import { paymentReceipt } from './components/money';
import { PatientHeader } from './components/PatientHeader';
import { RecordPaymentSheet } from './components/RecordPaymentSheet';
import { patientsApi } from './data/api';
import { errorText } from './data/errors';
import { useMutation, useQuery } from './data/hooks';
import type {
    Answers,
    CustomQuestion,
    Patient,
    PatientHistoryEntry,
    QuestionnaireGap,
    SettleInput,
} from './data/types';

export type PatientRecordScreenProps = {
    patientId: string;
    onBack: () => void;
    /** Where back goes, said in the caller's words: "Patients" from the list, "Day" from the day view. */
    backLabel?: string;
    /** Correcting the record — `PatientEditScreen`, which the cluster above routes to. */
    onEdit?: () => void;
    /**
     * The design's two openers. Both are the day cluster's booking flow, which
     * this cluster cannot reach — the shell routes them (`shell/routes.ts`), and
     * they carry the patient because the booking page names and dials them.
     */
    onBook?: (patient: Patient) => void;
    onWalkIn?: (patient: Patient) => void;
    /** A history row that became a visit — the cluster above opens it. */
    onOpenVisit?: (entry: PatientHistoryEntry) => void;
};

type Tab = 'visits' | 'details';

export function PatientRecordScreen({
    patientId,
    onBack,
    backLabel = 'Patients',
    onEdit,
    onBook,
    onWalkIn,
    onOpenVisit,
}: PatientRecordScreenProps) {
    const [tab, setTab] = useState<Tab>('visits');
    const [toast, setToast] = useState<string | null>(null);
    const [payingOpen, setPayingOpen] = useState(false);

    const record = useQuery(['byId', patientId], () => patientsApi.byId(patientId));
    const questions = useQuery(['questions'], () => patientsApi.listQuestions());
    const settle = useMutation(patientsApi.settle);

    const patient = record.data?.patient;
    const history = record.data?.history ?? [];

    // The record is one payload, so a pull is one round trip — plus the
    // question list, which is what decides whether an answer is a gap.
    const refreshControl = usePullToRefresh(() => {
        record.refetch();
        questions.refetch();
    }, record.loading || questions.loading);

    const edit = onEdit ?? (() => setToast('Editing a patient is not wired up from here yet.'));

    const outstanding = history.reduce((total, entry) => total + Math.max(entry.balance, 0), 0);
    const visits = history.filter((entry) => entry.visitId !== null).length;

    /**
     * The one write that takes money. The strip's total and the visit history
     * both move with it and both come off `patient.byId`, so one refetch is the
     * whole refresh — nothing is patched locally (§10). Everything on the
     * TanStack side (the money dashboard, the day view) is invalidated by the
     * `visit:updated` the server broadcasts per allocated visit.
     *
     * A failure leaves the sheet open with the amount still typed: the desk is
     * holding the cash, and clearing the field would make them count it again.
     */
    async function recordPayment(input: SettleInput) {
        const report = await settle.mutate(input);
        if (!report) return;

        setPayingOpen(false);
        record.refetch();
        setToast(paymentReceipt(report));
    }

    return (
        <View style={styles.screen}>
            <RecordBar onBack={onBack} backLabel={backLabel} onEdit={edit} />

            {record.error && record.data && (
                <Banner tone="warning" message="Could not refresh this record. Showing what was last read." />
            )}

            {record.loading && !record.data ? (
                <SkeletonRows count={5} gutter={size.gutter} ruled />
            ) : record.error && !record.data ? (
                <RefreshView refreshControl={refreshControl}>
                    <EmptyState
                        title="Could not open this record"
                        body={errorText(record.error)}
                        actionLabel="Try again"
                        onAction={record.refetch}
                        weight="panel"
                    />
                </RefreshView>
            ) : record.data && patient ? (
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={refreshControl}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.top}>
                        <PatientHeader patient={patient} onFailed={setToast} />

                        <Openers
                            patient={patient}
                            onBook={onBook}
                            onWalkIn={onWalkIn}
                            onUnavailable={setToast}
                        />

                        <Outstanding
                            amount={outstanding}
                            onRecordPayment={() => {
                                settle.reset();
                                setPayingOpen(true);
                            }}
                        />

                        <View style={styles.tabs}>
                            <SegmentedControl
                                segments={segments(visits)}
                                value={tab}
                                onChange={setTab}
                                size="sm"
                                accessibilityLabel="Record section"
                            />
                        </View>
                    </View>

                    {tab === 'visits' ? (
                        <History history={history} onOpenVisit={onOpenVisit} />
                    ) : (
                        <Details
                            answers={patient.custom}
                            gaps={record.data.questionnaireGaps}
                            questions={questions}
                            onEdit={edit}
                        />
                    )}
                </ScrollView>
            ) : null}

            {/* A child of the screen root, not the scroll content: `ui/Sheet` is
                a native Modal, and the toast that follows it has to be able to
                render above the same stack. */}
            {patient && outstanding > 0 ? (
                <RecordPaymentSheet
                    visible={payingOpen}
                    onClose={() => setPayingOpen(false)}
                    patientId={patient.id}
                    outstanding={outstanding}
                    isPending={settle.pending}
                    error={settle.error ? errorText(settle.error) : null}
                    onSubmit={(input) => void recordPayment(input)}
                />
            ) : null}

            <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
        </View>
    );
}

/**
 * The design's bar: a round back button, the word PATIENT set small and wide,
 * and a round `⋯` opposite. It is left-aligned rather than a centred title —
 * the name is the heading, twenty pixels below, and a bar repeating it at 17px
 * would make the screen look like it says the name twice.
 *
 * The trailing button is Edit, not the design's `⋯`. A `⋯` promises a menu, and
 * everything a menu here would hold is still unbuilt (merge, deactivate,
 * export) — so it would be three dots that open one thing, which is worse than
 * the one thing named. It goes back to `⋯` over `ui/PopoverMenu`, with Edit at
 * the top, the day a second action lands.
 */
function RecordBar({
    onBack,
    backLabel,
    onEdit,
}: {
    onBack?: () => void;
    backLabel: string;
    onEdit: () => void;
}) {
    return (
        <View style={styles.bar}>
            {onBack ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Back to ${backLabel}`}
                    onPress={onBack}
                    hitSlop={10}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                    <Chevron direction="back" size={9} tone="ink" />
                </Pressable>
            ) : (
                <View style={styles.iconButton} />
            )}

            <Text variant="eyebrow" tone="muted" style={styles.barEyebrow}>
                PATIENT
            </Text>

            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit this patient"
                onPress={onEdit}
                hitSlop={10}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                testID="record-edit"
            >
                <EditIcon size={15} stroke={color.ink} />
            </Pressable>
        </View>
    );
}

/**
 * The two things a record is opened to start. Both belong to the day cluster,
 * which this screen cannot reach on its own — the shell routes them. Without a
 * handler the button still says where the flow lives instead of failing
 * silently: that is a gallery or a test, and on the doctor's phone, where the
 * day view has no booking on it to open.
 */
function Openers({
    patient,
    onBook,
    onWalkIn,
    onUnavailable,
}: {
    patient: Patient;
    onBook?: (patient: Patient) => void;
    onWalkIn?: (patient: Patient) => void;
    onUnavailable: (message: string) => void;
}) {
    const elsewhere = () => onUnavailable('Booking opens from the Day tab for now.');

    return (
        <View style={styles.openers}>
            <Button
                label="Book appointment"
                size="md"
                onPress={onBook ? () => onBook(patient) : elsewhere}
                style={styles.opener}
            />
            <Button
                label="Walk-in today"
                variant="secondary"
                size="md"
                onPress={onWalkIn ? () => onWalkIn(patient) : elsewhere}
                style={styles.opener}
            />
        </View>
    );
}

/** The count rides on the tab, as the design draws it: `Visits · 32`. */
function segments(visits: number) {
    return [
        { value: 'visits' as const, label: visits > 0 ? `Visits · ${visits}` : 'Visits' },
        { value: 'details' as const, label: 'Details' },
    ];
}

/**
 * What this patient owes across every visit, and the way to settle it. A
 * hairline row rather than a filled panel: the amount carries the colour, and a
 * tinted block would make a standing balance read as something going wrong.
 *
 * **Absent at zero, which is also what puts the sheet out of reach.** A record
 * with nothing outstanding should not carry a line about money at all, and there
 * is no other way to the payment sheet — so a patient who owes nothing cannot be
 * settled from the client either, which is the rule `balance.settle` enforces on
 * its own side.
 *
 * The number is the patient's whole outstanding and can span several unsettled
 * visits. That used to be the reason this button left the cluster: a payment was
 * taken against one visit, so someone had to pick one. The server allocates now,
 * so the sheet opens here and the desk stays on the patient they are looking at.
 */
function Outstanding({ amount, onRecordPayment }: { amount: number; onRecordPayment: () => void }) {
    if (amount <= 0) return null;

    return (
        <View style={styles.strip}>
            <View style={styles.stripDot} />
            <Text variant="subhead" tone="muted" style={styles.stripLabel}>
                Outstanding
            </Text>
            <MoneyValue piastres={amount} tone="due" variant="headline" weight="bold" showCurrency={false} />
            <Pill label="Record payment" onPress={onRecordPayment} testID="record-payment" />
        </View>
    );
}

/**
 * The design's small outlined pill — `padding: 6px 12px`, 12px bold. `Button`'s
 * smallest is `md` at 48px tall, which is right for something you commit to and
 * twice the height of a control that rides on the end of a line of type.
 */
function Pill({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
            testID={testID}
        >
            <Text variant="footnote" weight="bold">
                {label}
            </Text>
        </Pressable>
    );
}

/**
 * The history, newest first, under a year band. The line above it is the
 * relationship in one sentence — how long they have been coming and what they
 * have paid over it — which is the summary both users read first and neither
 * would work out from the rows.
 */
function History({
    history,
    onOpenVisit,
}: {
    history: PatientHistoryEntry[];
    onOpenVisit?: (entry: PatientHistoryEntry) => void;
}) {
    const years = useMemo(() => groupByYear(history), [history]);
    const paid = history.reduce((total, entry) => total + entry.paidTotal, 0);

    if (history.length === 0) {
        return (
            <EmptyState
                title="Nothing on file yet"
                body="Appointments and visits appear here as soon as this patient is booked in."
                weight="line"
            />
        );
    }

    return (
        <View>
            <View style={styles.summary}>
                <Text variant="footnote" tone="muted">
                    {sinceLabel(history)}
                </Text>
                {/* Nothing paid yet is a patient who has not been through the
                    desk — the clause is left off rather than reading `EGP 0`. */}
                {paid > 0 ? (
                    <View style={styles.summaryPaid}>
                        <MoneyValue piastres={paid} variant="footnote" tone="muted" showCurrency={false} />
                        <Text variant="footnote" tone="muted">
                            paid
                        </Text>
                    </View>
                ) : null}
            </View>

            {years.map(([year, rows]) => (
                <View key={year}>
                    <View style={styles.band}>
                        <Text variant="eyebrow" tone="muted">
                            {year}
                        </Text>
                    </View>
                    {rows.map((entry) => (
                        <HistoryRow key={entry.appointmentId} entry={entry} onOpen={onOpenVisit} />
                    ))}
                </View>
            ))}
        </View>
    );
}

/** `Since Mar 2019`, off the oldest row — the list is newest first. */
function sinceLabel(history: PatientHistoryEntry[]): string {
    const oldest = history.at(-1);
    if (!oldest) return '';

    const date = new Date(oldest.startsAt);
    return `Since ${date.toLocaleString('en', { month: 'short' })} ${date.getFullYear()}`;
}

function groupByYear(history: PatientHistoryEntry[]): Array<[string, PatientHistoryEntry[]]> {
    const groups = new Map<string, PatientHistoryEntry[]>();
    for (const entry of history) {
        const year = String(new Date(entry.startsAt).getFullYear());
        const bucket = groups.get(year);
        if (bucket) bucket.push(entry);
        else groups.set(year, [entry]);
    }
    return [...groups].sort((a, b) => b[0].localeCompare(a[0]));
}

type DetailsProps = {
    answers: Answers;
    gaps: QuestionnaireGap[];
    questions: { data: CustomQuestion[] | undefined; loading: boolean; error: Error | undefined };
    onEdit: () => void;
};

/**
 * The clinic's questions and their answers, and nothing else — the design puts
 * age, sex and the phone number in the meta line under the name, so this tab is
 * only the part that differs from clinic to clinic.
 */
function Details({ answers, gaps, questions, onEdit }: DetailsProps) {
    const gapByKey = useMemo(() => new Map(gaps.map((gap) => [gap.key, gap])), [gaps]);

    const hidden = useMemo(() => {
        if (!questions.data) return 0;
        const shown = new Set(questions.data.map((q) => q.key));
        return Object.keys(answers).filter((key) => !shown.has(key)).length;
    }, [answers, questions.data]);

    const unanswered = gaps.filter((gap) => gap.reason === 'unanswered').length;
    const stale = gaps.filter((gap) => gap.reason === 'answer_no_longer_valid').length;

    return (
        <View style={styles.details}>
            <View style={styles.sectionHead}>
                <Text variant="eyebrow" tone="muted">
                    {questions.data ? `CLINIC QUESTIONS · ${questions.data.length}` : 'CLINIC QUESTIONS'}
                </Text>
                {questions.data && questions.data.length > 0 ? (
                    <Pill label="Edit" onPress={onEdit} testID="answer" />
                ) : null}
            </View>

            {gaps.length > 0 && (
                <View style={styles.gap}>
                    <Callout tone="warning" title="Still to ask">
                        {[
                            unanswered > 0 ? `${unanswered} never asked` : null,
                            stale > 0 ? `${stale} answered before the question changed` : null,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </Callout>
                </View>
            )}

            {questions.loading && !questions.data ? (
                <SkeletonRows count={3} gutter={space[4]} ruled />
            ) : questions.error && !questions.data ? (
                <EmptyState
                    title="Could not load the clinic's questions"
                    body={errorText(questions.error)}
                    weight="line"
                />
            ) : questions.data && questions.data.length === 0 ? (
                <EmptyState
                    title="No questions set up"
                    body="Questions the clinic adds in settings appear here for every patient."
                    weight="line"
                />
            ) : (
                <View>
                    {(questions.data ?? []).map((question) => (
                        <View key={question.key} style={styles.answer}>
                            <CustomAnswerRow
                                question={question}
                                value={answers[question.key]}
                                gap={gapByKey.get(question.key)?.reason}
                            />
                        </View>
                    ))}
                </View>
            )}

            <Text variant="caption" tone="muted" style={styles.footnote}>
                Answers follow the question set in Settings — deactivated questions keep their answers but
                stop showing.
            </Text>

            {hidden > 0 && (
                <View style={styles.gap}>
                    <Callout tone="note">
                        {`${hidden} ${hidden === 1 ? 'answer is' : 'answers are'} kept from questions the clinic no longer asks. They are hidden, not deleted, and come back if the question is reactivated.`}
                    </Callout>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    content: { paddingBottom: size.nav + space[6] },

    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        paddingHorizontal: space[4],
        paddingTop: space[1.5],
        paddingBottom: space[0.5],
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
    barEyebrow: { flex: 1 },
    pressed: { opacity: 0.6 },

    top: { paddingHorizontal: size.gutter, paddingTop: space[2] },
    openers: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
    // Taller than `md`'s 44: the design draws these at 15px of padding around a
    // 14px label, and they are the two things the screen exists to start. The
    // switch under them is `sm` for the same reason — the hierarchy is the
    // point, and at one height the row reads as four equal buttons.
    opener: { flex: 1, minHeight: size.button },

    strip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        marginTop: space[3],
        paddingVertical: space[3],
        borderTopWidth: border.hair,
        borderBottomWidth: border.hair,
        borderColor: color.line,
    },
    stripDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: color.due },
    stripLabel: { flex: 1 },
    pill: {
        paddingHorizontal: space[3],
        paddingVertical: space[1.5],
        borderRadius: radius.full,
        borderWidth: border.hair,
        borderColor: color.outline,
    },

    tabs: { marginTop: space[3] },

    summary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[4],
        paddingHorizontal: size.gutter,
        paddingTop: space[3],
        paddingBottom: space[2.5],
        borderTopWidth: border.hair,
        borderTopColor: color.line,
    },
    summaryPaid: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },

    // Full-bleed and half a shade off the rows, ruled top and bottom. The
    // ledger is one continuous tone from here down and the hairlines do all the
    // dividing; a white row on a grey page stripes the list and turns each line
    // into an object of its own.
    band: {
        paddingHorizontal: size.gutter,
        paddingVertical: space[1.5],
        backgroundColor: color.surface2,
        borderTopWidth: border.hair,
        borderBottomWidth: border.hair,
        borderColor: color.line,
    },

    details: { paddingTop: space[2] },
    sectionHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: size.gutter,
        paddingTop: space[3],
        paddingBottom: space[2],
    },
    gap: { paddingHorizontal: size.gutter, paddingVertical: space[1] },
    answer: {
        paddingHorizontal: size.gutter,
        borderBottomWidth: border.hair,
        borderBottomColor: color.line,
    },
    footnote: { paddingHorizontal: size.gutter, paddingTop: space[3] },
});
