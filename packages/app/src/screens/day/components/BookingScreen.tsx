/**
 * A booking, once the patient is known: what it is for, when it is, and a last
 * look before anything is written. The FAB used to open a walk-in and nothing
 * else, which made the day view a screen you could only add to *now* — the
 * phone call asking for Thursday had nowhere to go. So the walk-in became one
 * answer to "when" (`appointment.walkIn`, booked and checked in at `now`) and a
 * time on a later day became the other (`appointment.create`).
 *
 * A page rather than a sheet: a plan of procedures, a fortnight of days and a
 * grid of times do not fit above a keyboard. Who it is for is still asked in a
 * sheet (`BookPatientSheet`) — a search box and a short list is what a sheet is
 * good at — and answering it pushes this. The pane sits inside the day tab, so
 * Back returns to the day with its date, branch and scroll intact; the shell
 * lights the Patients tab while it is open, because that is the part of the
 * app this belongs to.
 *
 * The order of the questions is the order of the conversation at the desk:
 * what needs doing, then when they can come, then read it back. Nothing is
 * written until the last step's button. The clinic PC is across Tailscale, so a
 * refusal lands above that button in the words of what was being attempted
 * (§4/§14) — never a toast that slides away while the patient is standing there.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Callout, Chevron, Chip, Select, Textarea } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { slotIsFree, slotsFor } from '../booking';
import { api, type Branch, type ClinicDay, useLocalMutation, useLocalQuery } from '../data';
import { describeError } from '../errors';
import { isClosed } from '../hours';
import { formatMoney } from '../money';
import { describeProcedure, type PlannedProcedure, primaryTypeId, totalOf } from '../procedures';
import {
    clock12,
    formatDate,
    isoAt,
    localOffsetMinutes,
    monthShort,
    offsetForDate,
    parseKey,
    relativeDayLabel,
    todayKey,
} from '../time';
import { type PatientDraft, patientNameOf, patientPhoneOf, patientRefOf } from './PatientPicker';
import { ProcedurePlan } from './ProcedurePlan';
import { SlotPicker } from './SlotPicker';

export type BookingScreenProps = {
    /** Answered by `BookPatientSheet`, or handed straight in by a screen that
     * already has the patient — the patient record books this way. */
    patient: PatientDraft;
    branchId: string | null;
    branches: readonly Branch[];
    schedule: readonly ClinicDay[] | undefined;
    durationOptions: readonly number[];
    defaultDuration: number;
    /** The day the screen behind is on — where a scheduled booking opens. */
    dateKey: string;
    /** Minutes into today: what "now" means, and which times have gone. */
    nowMinutes: number;
    onBack: () => void;
    onBooked: (message: string) => void;
};

type Step = 'what' | 'when' | 'confirm';
type Timing = 'now' | 'later';

const STEPS: { key: Step; label: string }[] = [
    { key: 'what', label: 'Procedures' },
    { key: 'when', label: 'When' },
    { key: 'confirm', label: 'Confirm' },
];

export function BookingScreen({
    patient,
    branchId,
    branches,
    schedule,
    durationOptions,
    defaultDuration,
    dateKey,
    nowMinutes,
    onBack,
    onBooked,
}: BookingScreenProps) {
    const today = todayKey();
    // A walk-in is always "now", whatever day the screen behind is on — the
    // only thing that rules it out is a clinic that is shut today.
    const canWalkIn = !isClosed(today, schedule);

    const [index, setIndex] = useState(0);
    const [plan, setPlan] = useState<PlannedProcedure[]>([]);
    const [timing, setTiming] = useState<Timing>(canWalkIn && dateKey === today ? 'now' : 'later');
    const [date, setDate] = useState(dateKey < today ? today : dateKey);
    const [slotMinutes, setSlotMinutes] = useState<number | null>(null);
    const [duration, setDuration] = useState(defaultDuration);
    const [note, setNote] = useState('');
    const [branch, setBranch] = useState<string | null>(branchId);

    const walkIn = useLocalMutation(api.walkIn);
    const create = useLocalMutation(api.create);

    const step = STEPS[index]?.key ?? 'confirm';
    const scheduled = timing === 'later';
    const pending = walkIn.pending || create.pending;
    const error = scheduled ? create.error : walkIn.error;
    const failure = error ? describeError(error, scheduled ? 'booking' : 'walk-in') : null;

    const ref = patientRefOf(patient);
    const name = patientNameOf(patient);

    const catalogue = useLocalQuery('procedure-tree', api.procedureTree);

    // The day being booked into, which is usually not the day on screen behind
    // this one. `useLocalQuery` is not a cache (BLOCKED.md, F2), so this is its
    // own read; it is also the one answer to "is 3:00 still free", which both
    // the grid and the Book button have to agree on.
    const day = useLocalQuery(`booking-day:${date}`, () => api.byDate(date), {
        enabled: scheduled && !isClosed(date, schedule),
    });

    const slots = slotsFor({
        dateKey: date,
        schedule,
        appointments: (day.data ?? []).filter((row) => row.branchId === branch),
        durationMinutes: duration,
        nowMinutes: date === today ? nowMinutes : null,
    });

    const timeIsFree = !scheduled || slotIsFree(slots, slotMinutes);
    const whenAnswered = !scheduled || (slotMinutes !== null && timeIsFree);
    const ready = ref !== null && branch !== null && whenAnswered;

    function reset() {
        walkIn.reset();
        create.reset();
    }

    function book() {
        if (!ref || !branch || !ready) return;

        const typeId = primaryTypeId(plan);
        const body = noteWithPlan(note, plan);

        if (!scheduled) {
            walkIn.mutate(
                {
                    patient: ref,
                    branchId: branch,
                    durationMinutes: duration,
                    typeId,
                    note: body,
                    offsetMinutes: localOffsetMinutes(),
                },
                { onSuccess: () => onBooked(name ? `${name} is checked in` : 'Walk-in checked in') },
            );
            return;
        }

        if (slotMinutes === null) return;

        create.mutate(
            {
                patient: ref,
                branchId: branch,
                startsAt: isoAt(date, slotMinutes),
                durationMinutes: duration,
                typeId,
                note: body,
                offsetMinutes: offsetForDate(date),
            },
            { onSuccess: () => onBooked(`${name} — ${dayLabel(date)} at ${timeLabel(slotMinutes)}`) },
        );
    }

    const last = step === 'confirm';
    const stepReady = step === 'when' ? whenAnswered && branch !== null : true;

    return (
        <View style={styles.screen} testID="booking-screen">
            <View style={styles.topbar}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={index === 0 ? 'Back to the day' : 'Back a step'}
                    disabled={pending}
                    onPress={() => {
                        if (index === 0) {
                            onBack();
                            return;
                        }
                        reset();
                        if (scheduled) day.refetch();
                        setIndex(index - 1);
                    }}
                    style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
                >
                    <Chevron direction="back" size={10} tone="ink" />
                </Pressable>
                <Text variant="eyebrow" tone="muted">
                    NEW BOOKING
                </Text>
            </View>

            <View style={styles.identity}>
                <View style={styles.tile}>
                    {scheduled ? (
                        <>
                            <Text variant="title3" script="sans" weight="bold" tone="inverse">
                                {parseKey(date).getDate()}
                            </Text>
                            <Text variant="eyebrow" tone="inverse" style={styles.tileMonth}>
                                {monthShort(date).toUpperCase()}
                            </Text>
                        </>
                    ) : (
                        <Text variant="eyebrow" tone="inverse">
                            NOW
                        </Text>
                    )}
                </View>

                <View style={styles.who}>
                    <Text variant="title3" numberOfLines={1}>
                        {name}
                    </Text>
                    <Text variant="subhead" tone="muted" numberOfLines={1}>
                        {patientPhoneOf(patient) || 'No phone on file'}
                    </Text>
                    <View style={styles.chip}>
                        <Text variant="caption" weight="semibold" tone="ink2">
                            {scheduled
                                ? slotMinutes === null
                                    ? `${dayLabel(date)} · no time yet`
                                    : `${dayLabel(date)} · ${timeLabel(slotMinutes)}`
                                : 'Walk-in · starting now'}
                        </Text>
                    </View>
                </View>
            </View>

            <Steps index={index} />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
            >
                {step === 'what' ? (
                    <>
                        <ProcedurePlan
                            value={plan}
                            onChange={setPlan}
                            categories={catalogue.data ?? []}
                            loading={catalogue.status === 'loading'}
                            error={catalogue.status === 'error' ? catalogue.error : null}
                            onRetry={catalogue.refetch}
                        />

                        <Textarea
                            label="Note"
                            value={note}
                            onChangeText={setNote}
                            placeholder="Anything the doctor should know."
                        />
                    </>
                ) : step === 'when' ? (
                    <>
                        <View style={styles.section}>
                            <Text variant="eyebrow" tone="muted">
                                WHEN
                            </Text>
                            <View style={styles.row}>
                                <Chip
                                    label="Now — walk-in"
                                    grow
                                    selected={!scheduled}
                                    disabled={!canWalkIn}
                                    onPress={() => {
                                        setTiming('now');
                                        reset();
                                    }}
                                />
                                <Chip
                                    label="Another time"
                                    grow
                                    selected={scheduled}
                                    onPress={() => {
                                        setTiming('later');
                                        reset();
                                    }}
                                />
                            </View>

                            {!canWalkIn ? (
                                <Text variant="caption" tone="muted">
                                    The clinic is closed today, so there is no walk-in to take.
                                </Text>
                            ) : !scheduled && dateKey !== today ? (
                                <Text variant="caption" tone="muted">
                                    A walk-in starts now, so it lands on today — not the day on screen.
                                </Text>
                            ) : !scheduled ? (
                                <Text variant="subhead" tone="muted">
                                    Booked and checked in at once, the same as anyone already in the waiting
                                    room.
                                </Text>
                            ) : null}
                        </View>

                        {scheduled ? (
                            <SlotPicker
                                dateKey={date}
                                onPickDate={setDate}
                                slotMinutes={slotMinutes}
                                onPickSlot={(next) => {
                                    setSlotMinutes(next);
                                    reset();
                                }}
                                slots={slots}
                                loading={day.status === 'loading'}
                                error={day.status === 'error' ? day.error : null}
                                onRetry={day.refetch}
                                schedule={schedule}
                            />
                        ) : null}

                        <View style={styles.section}>
                            <Text variant="eyebrow" tone="muted">
                                HOW LONG
                            </Text>
                            <View style={styles.row}>
                                {durationOptions.map((option) => (
                                    <Chip
                                        key={option}
                                        label={`${option} min`}
                                        grow
                                        selected={duration === option}
                                        onPress={() => {
                                            setDuration(option);
                                            reset();
                                        }}
                                    />
                                ))}
                            </View>
                        </View>

                        {branches.length > 1 ? (
                            <Select
                                label="Branch"
                                options={branches.map((row) => ({ value: row.id, label: row.name }))}
                                value={branch}
                                onChange={(next) => {
                                    setBranch(next);
                                    setSlotMinutes(null);
                                    reset();
                                }}
                                sheetTitle="Which branch"
                            />
                        ) : null}
                    </>
                ) : (
                    <View style={styles.summary}>
                        <SummaryRow
                            label="When"
                            value={
                                scheduled && slotMinutes !== null
                                    ? `${relativeDayLabel(date)} · ${timeLabel(slotMinutes)}`
                                    : 'Now — walk-in'
                            }
                        />
                        <SummaryRow label="How long" value={`${duration} min`} />
                        {branches.length > 1 ? (
                            <SummaryRow
                                label="Branch"
                                value={branches.find((row) => row.id === branch)?.name ?? '—'}
                            />
                        ) : null}
                        <SummaryRow
                            label="Patient"
                            value={patient.mode === 'new' ? `${name} · new record` : name}
                        />

                        <View style={styles.divider} />

                        {plan.length === 0 ? (
                            <Text variant="subhead" tone="muted">
                                No procedures planned — it will be decided in the chair.
                            </Text>
                        ) : (
                            <>
                                {plan.map((item) => (
                                    <View key={item.id} style={styles.summaryLine}>
                                        <Text variant="subhead" style={styles.grow} numberOfLines={1}>
                                            {describeProcedure(item)}
                                        </Text>
                                        <Text variant="subhead" weight="semibold">
                                            {formatMoney(item.price)}
                                        </Text>
                                    </View>
                                ))}
                                <View style={styles.summaryLine}>
                                    <Text variant="subhead" tone="muted" style={styles.grow}>
                                        Estimated total
                                    </Text>
                                    <Text variant="headline">{formatMoney(totalOf(plan))}</Text>
                                </View>
                            </>
                        )}

                        {note.trim() ? (
                            <>
                                <View style={styles.divider} />
                                <Text variant="subhead" tone="muted">
                                    {note.trim()}
                                </Text>
                            </>
                        ) : null}
                    </View>
                )}
            </ScrollView>

            {branch === null ? (
                <View style={styles.notice}>
                    <Callout tone="warning" title="No branch to book into">
                        The clinic’s branches could not be loaded, so there is nowhere to put this booking.
                    </Callout>
                </View>
            ) : null}

            {failure ? (
                <View style={styles.notice}>
                    <Callout tone="warning" title={failure.title}>
                        {failure.body ?? ''}
                    </Callout>
                </View>
            ) : null}

            <View style={styles.bar}>
                <Button
                    label={last ? (scheduled ? 'Book it' : 'Start the visit') : 'Next'}
                    block
                    loading={pending}
                    disabled={last ? !ready : !stepReady}
                    onPress={() => {
                        if (last) {
                            book();
                            return;
                        }
                        reset();
                        setIndex(index + 1);
                    }}
                    testID="booking-next"
                />
            </View>
        </View>
    );
}

/** Which of the three questions this is — the page's own progress. */
function Steps({ index }: { index: number }) {
    return (
        <View
            accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}
            style={styles.steps}
            testID="booking-steps"
        >
            {STEPS.map((step, at) => (
                <View key={step.key} style={styles.step}>
                    <View style={[styles.stepBar, at <= index && styles.stepBarDone]} />
                    <Text
                        variant="caption"
                        weight={at === index ? 'semibold' : 'regular'}
                        tone={at === index ? 'ink' : 'muted'}
                    >
                        {step.label}
                    </Text>
                </View>
            ))}
        </View>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.summaryLine}>
            <Text variant="subhead" tone="muted" style={styles.grow}>
                {label}
            </Text>
            <Text variant="subhead" weight="medium" numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

/**
 * Until an appointment can carry a list of its own, the plan rides in the note:
 * `typeId` holds the first line, and the rest would otherwise be lost between
 * the desk and the chair — which is worse than a note the doctor can read.
 */
function noteWithPlan(note: string, plan: readonly PlannedProcedure[]): string | null {
    const typed = note.trim();
    if (plan.length < 2) return typed || null;

    const planned = `Planned: ${plan.map(describeProcedure).join(', ')}`;
    return typed ? `${planned}\n${typed}` : planned;
}

/** "today"/"tomorrow" read as words in a sentence; a date keeps its capitals. */
function dayLabel(key: string): string {
    const label = relativeDayLabel(key);
    return label === formatDate(key) ? label : label.toLowerCase();
}

function timeLabel(minutes: number): string {
    const { time, meridiem } = clock12(minutes);
    return `${time} ${meridiem.toLowerCase()}`;
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },

    topbar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        paddingHorizontal: space[3],
        paddingTop: space[2],
        paddingBottom: space[1],
    },
    back: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    backPressed: { backgroundColor: color.surface2 },

    identity: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3.5],
        paddingHorizontal: size.gutter,
        paddingTop: space[2],
        paddingBottom: space[4],
    },
    tile: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.xl2,
        backgroundColor: color.ink,
    },
    tileMonth: { opacity: 0.62 },
    who: { flex: 1, minWidth: 0, gap: space[1], alignItems: 'flex-start' },
    chip: {
        paddingHorizontal: space[2.5],
        paddingVertical: space[1],
        borderRadius: radius.full,
        backgroundColor: color.surface2,
    },

    steps: { flexDirection: 'row', gap: space[2], paddingHorizontal: size.gutter, paddingBottom: space[3] },
    step: { flex: 1, gap: space[1.5] },
    stepBar: { height: 3, borderRadius: radius.full, backgroundColor: color.line },
    stepBarDone: { backgroundColor: color.ink },

    scroll: { flex: 1 },
    body: { paddingHorizontal: size.gutter, paddingBottom: space[8], gap: space[5] },
    section: { gap: space[2.5] },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    grow: { flex: 1, minWidth: 0 },

    summary: {
        gap: space[2.5],
        padding: space[4],
        borderRadius: radius.xl,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    summaryLine: { flexDirection: 'row', alignItems: 'baseline', gap: space[3] },
    divider: { height: border.hair, backgroundColor: color.line },

    notice: { paddingHorizontal: size.gutter, paddingBottom: space[2] },
    bar: {
        paddingHorizontal: size.gutter,
        paddingTop: space[3],
        paddingBottom: space[4],
        borderTopWidth: border.hair,
        borderTopColor: color.hair,
        backgroundColor: color.surface,
    },
});
