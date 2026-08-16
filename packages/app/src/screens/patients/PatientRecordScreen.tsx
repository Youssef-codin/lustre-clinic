// One patient: visits, details, and the clinic's own questions. `patient.byId`
// is one payload — patient, visit history and `questionnaireGaps` — so the
// record is a single round trip and what it is missing is answered by the
// server. Nothing about any clinic's questionnaire is written down here; a
// second clinic's different list renders the same way. Gaps are recomputed by
// the server, so a record that just stopped being a gap is re-read rather than
// patched locally. Back is disabled while a write is open so an edit is never
// abandoned mid-flight. The toast is a child of the screen root, not the scroll
// view. Visits group by the parsed date's local year, not the ISO prefix — an
// evening visit on 31 December is UTC 1 January and would sit under the wrong
// heading. Answers to deactivated questions are hidden but still on the record
// (§7.8).
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
    Banner,
    Button,
    Callout,
    Card,
    CardDivider,
    Dot,
    EmptyState,
    RefreshView,
    SectionLabel,
    SegmentedControl,
    Toast,
    TopBar,
    usePullToRefresh,
} from '../../components/ui';
import { color, radius, size, space, Text } from '../../theme';
import { _LocalMoneyValue } from './components/_LocalMoneyValue';
import { SkeletonRows } from './components/_LocalSkeleton';
import { _LocalVisitRow } from './components/_LocalVisitRow';
import { CustomAnswerRow } from './components/CustomAnswerRow';
import { _LocalPatientsApi } from './data/_LocalPatientsApi';
import { useMutation, useQuery } from './data/_LocalQuery';
import { errorText } from './data/errors';
import type { Answers, CustomQuestion, PatientVisit, QuestionnaireGap } from './data/types';
import { QuestionnaireSheet } from './QuestionnaireSheet';

export type PatientRecordScreenProps = {
    patientId: string;
    onBack: () => void;
};

type Tab = 'visits' | 'details';

const TABS = [
    { value: 'visits', label: 'Visits' },
    { value: 'details', label: 'Details' },
] as const;

export function PatientRecordScreen({ patientId, onBack }: PatientRecordScreenProps) {
    const [tab, setTab] = useState<Tab>('visits');
    const [editing, setEditing] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const record = useQuery(() => _LocalPatientsApi.byId(patientId), [patientId]);
    const questions = useQuery(() => _LocalPatientsApi.listQuestions(), []);

    const save = useMutation((custom: Answers) => _LocalPatientsApi.update({ id: patientId, custom }));

    const patient = record.data?.patient;

    // The record is one payload, so a pull is one round trip — plus the
    // question list, which is what decides whether an answer is a gap.
    const refreshControl = usePullToRefresh(() => {
        record.refetch();
        questions.refetch();
    }, record.loading || questions.loading);

    const onSave = async (patch: Answers) => {
        const saved = await save.mutate(patch);
        if (!saved) return;
        setEditing(false);
        setToast('Answers saved');
        record.refetch();
    };

    return (
        <View style={styles.screen}>
            <TopBar
                title={patient?.name}
                subtitle={patient?.phone}
                onBack={save.pending ? undefined : onBack}
                backLabel="Patients"
                divider
            />

            {record.error && record.data && (
                <Banner tone="warning" message="Could not refresh this record. Showing what was last read." />
            )}

            {record.loading && !record.data ? (
                <SkeletonRows count={5} gutter={size.gutter} />
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
                >
                    <View style={styles.tabs}>
                        <SegmentedControl
                            segments={TABS}
                            value={tab}
                            onChange={setTab}
                            accessibilityLabel="Record section"
                        />
                    </View>

                    {tab === 'visits' ? (
                        <Visits visits={record.data.visits} />
                    ) : (
                        <Details
                            email={patient.email}
                            age={patient.age}
                            gender={patient.gender}
                            createdAt={patient.createdAt}
                            answers={patient.custom}
                            gaps={record.data.questionnaireGaps}
                            questions={questions}
                            onEdit={() => {
                                save.reset();
                                setEditing(true);
                            }}
                        />
                    )}
                </ScrollView>
            ) : null}

            {record.data && questions.data && (
                <QuestionnaireSheet
                    visible={editing}
                    questions={questions.data}
                    answers={record.data.patient.custom}
                    pending={save.pending}
                    error={save.error ? errorText(save.error) : undefined}
                    onClose={() => setEditing(false)}
                    onSave={onSave}
                />
            )}

            <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
        </View>
    );
}

function Visits({ visits }: { visits: PatientVisit[] }) {
    const outstanding = visits.reduce((total, visit) => total + Math.max(visit.balance, 0), 0);
    const years = useMemo(() => groupByYear(visits), [visits]);

    if (visits.length === 0) {
        return (
            <EmptyState
                title="No visits yet"
                body="Visits appear here once this patient has been checked in."
                weight="line"
            />
        );
    }

    return (
        <View style={styles.section}>
            {outstanding > 0 && (
                <View style={styles.strip}>
                    <Dot tone="due" size={7} />
                    <Text variant="subhead" tone="due" weight="medium" style={styles.stripLabel}>
                        Outstanding
                    </Text>
                    <_LocalMoneyValue amount={outstanding} tone="due" />
                </View>
            )}

            {years.map(([year, rows]) => (
                <View key={year} style={styles.group}>
                    <SectionLabel count={rows.length}>{year}</SectionLabel>
                    <Card style={styles.card}>
                        {rows.map((visit, index) => (
                            <View key={visit.visitId}>
                                {index > 0 && <CardDivider />}
                                <_LocalVisitRow visit={visit} />
                            </View>
                        ))}
                    </Card>
                </View>
            ))}
        </View>
    );
}

function groupByYear(visits: PatientVisit[]): Array<[string, PatientVisit[]]> {
    const groups = new Map<string, PatientVisit[]>();
    for (const visit of visits) {
        const year = String(new Date(visit.startsAt).getFullYear());
        const bucket = groups.get(year);
        if (bucket) bucket.push(visit);
        else groups.set(year, [visit]);
    }
    return [...groups].sort((a, b) => b[0].localeCompare(a[0]));
}

type DetailsProps = {
    email: string | null;
    age: number | null;
    gender: string | null;
    createdAt: string;
    answers: Answers;
    gaps: QuestionnaireGap[];
    questions: { data: CustomQuestion[] | undefined; loading: boolean; error: Error | undefined };
    onEdit: () => void;
};

function Details({ email, age, gender, createdAt, answers, gaps, questions, onEdit }: DetailsProps) {
    const gapByKey = useMemo(() => new Map(gaps.map((gap) => [gap.key, gap])), [gaps]);

    const hidden = useMemo(() => {
        if (!questions.data) return 0;
        const shown = new Set(questions.data.map((q) => q.key));
        return Object.keys(answers).filter((key) => !shown.has(key)).length;
    }, [answers, questions.data]);

    const unanswered = gaps.filter((gap) => gap.reason === 'unanswered').length;
    const stale = gaps.filter((gap) => gap.reason === 'answer_no_longer_valid').length;

    return (
        <View style={styles.section}>
            <SectionLabel>Patient</SectionLabel>
            <Card style={styles.card}>
                <DetailRow label="Email" value={email} />
                <CardDivider />
                <DetailRow label="Age" value={age === null ? null : String(age)} mono />
                <CardDivider />
                <DetailRow label="Sex" value={gender} />
                <CardDivider />
                <DetailRow label="Registered" value={createdAt.slice(0, 10)} mono />
            </Card>

            <SectionLabel
                count={questions.data?.length}
                action={
                    questions.data && questions.data.length > 0 ? (
                        <Button label="Answer" variant="text" size="md" onPress={onEdit} testID="answer" />
                    ) : undefined
                }
            >
                Clinic questions
            </SectionLabel>

            {gaps.length > 0 && (
                <View style={styles.inset}>
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
                <SkeletonRows count={3} gutter={space[4]} />
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
                <Card style={styles.card}>
                    {(questions.data ?? []).map((question, index) => (
                        <View key={question.key}>
                            {index > 0 && <CardDivider />}
                            <CustomAnswerRow
                                question={question}
                                value={answers[question.key]}
                                gap={gapByKey.get(question.key)?.reason}
                            />
                        </View>
                    ))}
                </Card>
            )}

            {hidden > 0 && (
                <View style={styles.inset}>
                    <Callout tone="note">
                        {`${hidden} ${hidden === 1 ? 'answer is' : 'answers are'} kept from questions the clinic no longer asks. They are hidden, not deleted, and come back if the question is reactivated.`}
                    </Callout>
                </View>
            )}
        </View>
    );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
    return (
        <View style={styles.detailRow}>
            <Text variant="subhead" tone="muted" style={styles.detailLabel}>
                {label}
            </Text>
            <View style={styles.detailValue}>
                {value === null || value === '' ? (
                    <Text variant="body" tone="muted">
                        —
                    </Text>
                ) : (
                    <Text variant="body" weight="semibold" script={mono ? 'mono' : undefined}>
                        {value}
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    content: { paddingBottom: space[12], gap: space[4] },
    tabs: { paddingHorizontal: size.gutter, paddingTop: space[3] },
    section: { gap: space[2] },
    group: { gap: space[1] },
    card: { marginHorizontal: size.gutter },
    inset: { paddingHorizontal: size.gutter },
    strip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        marginHorizontal: size.gutter,
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        borderRadius: radius.xl2,
        backgroundColor: color.dueSoft,
    },
    stripLabel: { flex: 1 },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row,
        paddingHorizontal: space[4],
        paddingVertical: space[2],
    },
    detailLabel: { width: 110 },
    detailValue: { flex: 1, alignItems: 'flex-end' },
});
