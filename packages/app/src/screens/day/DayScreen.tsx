/**
 * The day view — the screen the secretary has open all day. It answers three
 * questions in the design's order: what has already happened (folded away),
 * who is in the chair (the black card), and what is still to come. Two rules
 * run through it: every list has loading, error and empty states, and every
 * write reports what happened to it in place — the clinic PC is across
 * Tailscale, so silence is the one thing a write is never allowed to be. The
 * sheets are keyed/sequenced so each opening is a fresh draft and a
 * half-finished confirm cannot be inherited by the next patient. The day
 * banner distinguishes an unloaded schedule from an unconfigured one — both
 * fall back to the same default hours, but the second is the clinic's own
 * guess while the first is this screen's.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
    Banner,
    Button,
    PushView,
    RefreshView,
    SegmentedControl,
    Toast,
    usePullToRefresh,
} from '../../components/ui';
import { border, color, radius, size, space, Text } from '../../theme';
import { procedureLabel, splitDay } from './agenda';
import { type Standing, splitDeskDay } from './chair';
import { BeforeThis, UpNext } from './components/Agenda';
import { AppointmentDetailSheet } from './components/AppointmentDetailSheet';
import { BookFab } from './components/BookFab';
import { BookingScreen } from './components/BookingScreen';
import { BookPatientSheet } from './components/BookPatientSheet';
import { CalendarSheet } from './components/CalendarSheet';
import { ClosedDay } from './components/ClosedDay';
import { DayHeader } from './components/DayHeader';
import { DayEmpty, DayError, DaySkeleton } from './components/DayStates';
import { ChatIcon, ClockIcon } from './components/icons';
import { NowCard } from './components/NowCard';
import { Reminders } from './components/Reminders';
import { VisitPaymentScreen } from './components/VisitPaymentScreen';
import { VisitScreen } from './components/VisitScreen';
import { VisitViewScreen } from './components/VisitViewScreen';
import {
    type Appointment,
    api,
    checkInTimes,
    type Patient,
    useLocalMutation,
    useLocalQuery,
    type Visit,
    visitForAppointment,
} from './data';
import { dayDelay, delayLabel, delayReason } from './delay';
import { describeError } from './errors';
import { isClosed } from './hours';
import { busiestBranch, holdsSlot } from './month';
import { draftFor, type PatientDraft } from './patientDraft';
import { relativeDayLabel, todayKey } from './time';
import { useNowMinutes } from './useNow';

type DayTab = 'day' | 'reminders';

/**
 * A booking asked for from outside this cluster — the patient record's Book and
 * Walk-in, routed here by the shell because a cluster cannot push into another
 * one's stack. It skips `BookPatientSheet`, whose only question is already
 * answered, and opens `BookingScreen` on the patient it names. `timing` is the
 * difference between the two buttons: a walk-in is the "now" answer to when.
 * `seq` makes each ask distinct, so the same patient can be booked twice.
 */
export type OpenBookingRequest = {
    patient: Patient;
    timing: 'now' | 'later';
    seq: number;
};

export type DayScreenProps = {
    /** The booking page covers the day pane; the shell lights the Patients tab
     * while it is up, because a booking belongs to the patient, not to today. */
    onBookingChange?: (open: boolean) => void;
    /**
     * Open a patient's record. The shell owns the route because the record
     * lives on the Patients tab, and the tab bar has to move with it — and it
     * carries `said` for the same reason: a toast raised here would draw inside
     * a pane the shell is about to hide. `backLabel` names where the record was
     * opened from, which is not always the day: a tap in the Reminders tab has
     * to come back to Reminders, not to the day behind it.
     */
    onOpenRecord?: (patientId: string, said?: string, backLabel?: string) => void;
    /** A booking pushed in from another cluster — the patient record's two openers. */
    open?: OpenBookingRequest;
    /**
     * Bumped by the shell when the Day tab is tapped while it is already up.
     * Home is the schedule: whatever is pushed over it closes, and the date and
     * branch stay where they were — they are what the desk chose, not a route.
     */
    goHome?: number;
};

export function DayScreen({ onBookingChange, onOpenRecord, open, goHome = 0 }: DayScreenProps = {}) {
    const [dateKey, setDateKey] = useState(todayKey);
    const [tab, setTab] = useState<DayTab>('day');
    const [branchId, setBranchId] = useState<string | null>(null);
    const [calendar, setCalendar] = useState({ open: false, seq: 0 });
    const [booking, setBooking] = useState({ open: false, seq: 0 });
    // Who it is for is a sheet; the rest of the booking is a page pushed over
    // the day (`PushView`), so the day keeps its date, branch and scroll and
    // the tab bar stays where it is. The draft outlives the page's exit
    // animation — clearing it on Back would unmount the pane mid-slide.
    const [page, setPage] = useState<{
        patient: PatientDraft;
        /** Set only when the booking was asked for from outside, which says which button it was. */
        timing?: 'now' | 'later';
        seq: number;
    } | null>(null);
    const [pageOpen, setPageOpen] = useState(false);
    const [seenOpen, setSeenOpen] = useState(0);
    const [seenHome, setSeenHome] = useState(goHome);
    const [selected, setSelected] = useState<{ appointment: Appointment | null; open: boolean }>({
        appointment: null,
        open: false,
    });
    // Finishing a visit is two pages pushed over the day — what was done, then
    // what was paid — not one sheet holding both. `open` is separate from the
    // target so the pages survive their own exit animation, and `step` lives
    // here rather than inside them because Back on the payment page returns to
    // the treatment page, not to the day.
    const [visit, setVisit] = useState<{
        appointment: Appointment;
        /** Absent on an arrival — Confirm is what creates it. */
        visit: Visit | null;
        /**
         * Why the flow was opened. It decides what the editor's bar offers and
         * where Back goes: an arrival confirms into the waiting room, a
         * checkout goes on to the money, and a finished visit has the read-only
         * page underneath.
         */
        origin: 'view' | 'arrival' | 'checkout';
        /**
         * Where the patient was standing when the flow opened — the queue's
         * answer, which the status cannot give: the chair and the three people
         * behind it are all `checked_in`.
         */
        standing: Standing | null;
        step: 'view' | 'treatment' | 'payment';
        seq: number;
    } | null>(null);
    const [visitOpen, setVisitOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    // Both derived during render rather than in an effect, so the page is on
    // screen in the same commit as the tab switch and the pane never paints the
    // schedule for a frame first.
    if (open && open.seq !== seenOpen) {
        setSeenOpen(open.seq);
        setBooking((current) => ({ ...current, open: false }));
        setPage((current) => ({
            patient: draftFor(open.patient),
            timing: open.timing,
            seq: (current?.seq ?? 0) + 1,
        }));
        setPageOpen(true);
    }

    // Everything pushed over the schedule comes down. The shell drops the
    // booking highlight itself — it is what raised it — so nothing is reported
    // back up from inside a render.
    if (goHome !== seenHome) {
        setSeenHome(goHome);
        setTab('day');
        setPageOpen(false);
        setVisitOpen(false);
        setBooking((current) => ({ ...current, open: false }));
        setCalendar((current) => ({ ...current, open: false }));
        setSelected((current) => ({ ...current, open: false }));
    }

    const nowMinutes = useNowMinutes();

    const schedule = useLocalQuery('schedule', api.schedule);
    const settings = useLocalQuery('settings', api.settings);
    const branches = useLocalQuery('branches', api.branches);
    // The day is fetched for the whole clinic and split here, so the screen can
    // open on the branch holding most of it: `branches[0]` drew an empty Maadi
    // while Nasr City had the day, and the emptiness read as a broken fetch. A
    // branch the user picked wins over the count, and holds until they pick
    // another.
    const day = useLocalQuery(`day:${dateKey}`, () => api.byDate(dateKey));
    const clinicDay = day.data ?? [];
    const branch =
        branchId ?? busiestBranch(clinicDay.filter(holdsSlot), null) ?? branches.data?.[0]?.id ?? null;

    const reminders = useLocalQuery('reminders', () => api.pendingReminders(todayKey()));
    const reminderCount = reminders.data?.length ?? 0;

    // Tapping a row that already has a visit. Separate from `loadVisit` so a
    // tap during a check-in is not swallowed by the other one's in-flight guard.
    const openRow = useLocalMutation(visitForAppointment);
    const noShow = useLocalMutation(api.markNoShow);

    const appointments = clinicDay.filter((row) => row.branchId === branch);
    const closed = isClosed(dateKey, schedule.data);

    // An empty branch on a day the clinic is working says so, and offers the
    // branch working it — the same fetch already has the rows, and "Nothing
    // booked" over a full Nasr City is the thing that reads as a broken app.
    const away = clinicDay.filter((row) => row.branchId !== branch && holdsSlot(row));
    const awayId = busiestBranch(away, null);
    const awayName = (branches.data ?? []).find((row) => row.id === awayId)?.name;
    const elsewhere =
        awayId && awayName
            ? {
                  name: awayName,
                  count: away.filter((row) => row.branchId === awayId).length,
                  onGo: () => setBranchId(awayId),
              }
            : undefined;
    const isToday = dateKey === todayKey();

    const checkedInIds = useMemo(
        () =>
            appointments
                .filter((row) => row.status === 'checked_in')
                .map((row) => row.id)
                .sort(),
        [appointments],
    );
    const arrivals = useLocalQuery(`arrivals:${checkedInIds.join(',')}`, () => checkInTimes(checkedInIds), {
        enabled: checkedInIds.length > 0,
    });

    // A pull re-asks for this screen's five reads and nothing else. The other
    // tabs are mounted behind this one and refetching them from here would put
    // three screens' worth of traffic on the tunnel for a screen nobody is
    // looking at — `/ws` is what keeps those fresh. A failed refresh keeps the
    // day on screen behind its banner, so the gesture is safe on a bad signal.
    const reads = [day, schedule, branches, reminders, arrivals];
    const refreshControl = usePullToRefresh(
        () => {
            day.refetch();
            schedule.refetch();
            branches.refetch();
            reminders.refetch();
            if (checkedInIds.length > 0) arrivals.refetch();
        },
        reads.some((read) => read.refreshing || read.status === 'loading'),
    );

    // The chair is the queue's head, not whoever's slot the clock happens to be
    // inside — the doctor's screen reads it the same way, and picking by slot
    // was what had the two screens seating different patients.
    const { chair, waiting, desk, next, card } = useMemo(
        () => splitDeskDay(appointments, arrivals.data),
        [appointments, arrivals.data],
    );

    // Whoever the black card is about: money owed outranks the chair, so a
    // patient at the desk holds it until they have paid.
    const active = desk ?? chair;

    // Only today folds: "before this" is relative to now, and off today every
    // row is settled, so folding put the whole day behind a section this screen
    // draws on today alone — an empty body under a tab still counting the rows.
    const { past, upcoming } = splitDay(appointments, isToday ? (card?.id ?? null) : null, isToday);

    // What the chair's overrun and any walk-ins mean for everyone still to be
    // seen. Nothing is written — `startsAt` stays the time the patient was told
    // — and the projection unwinds by itself as the day catches up.
    const delay = useMemo(
        () => dayDelay(appointments, isToday ? nowMinutes : null, arrivals.data),
        [appointments, isToday, nowMinutes, arrivals.data],
    );

    // The calendar counts every branch, so a picked day carries the branch it
    // is busiest in; following it is what stops the grid promising a day the
    // day view then draws empty. A day with nothing booked carries no branch.
    const pickDay = (nextDate: string, nextBranch: string | null) => {
        setDateKey(nextDate);
        if (nextBranch) setBranchId(nextBranch);
    };

    const openBooking = () => setBooking((current) => ({ open: true, seq: current.seq + 1 }));

    /**
     * A row with a visit behind it is a way into that visit, not into a menu:
     * tapping the patient in the chair goes straight to what was done. The
     * sheet stays for everything else, which is where the booking-time actions
     * live (check in, cancel, no-show) and where a finished visit is read.
     * A visit that cannot be found falls back to the sheet rather than to
     * nothing — the row still has to open.
     */
    function openDetail(appointment: Appointment) {
        const live = appointment.status === 'checked_in' || appointment.status === 'awaiting_payment';
        // A finished visit opens read-only: it is history until someone says
        // otherwise, and `Edit visit` on that screen is what says otherwise.
        const finished = appointment.status === 'done';
        if (!live && !finished) {
            setSelected({ appointment, open: true });
            return;
        }

        openRow.mutate(appointment.id, {
            onSuccess: (loaded) => {
                if (loaded) {
                    openVisit(appointment, loaded, finished ? 'view' : 'checkout');
                    return;
                }
                setSelected({ appointment, open: true });
            },
        });
    }

    // Nothing to wait for: checking in opens a screen and writes nothing, so
    // no row is ever mid-check-in.
    const checkingInId = null;

    function openVisit(
        appointment: Appointment,
        loaded: Visit | null,
        origin: 'view' | 'arrival' | 'checkout' = 'checkout',
    ) {
        setVisit((current) => ({
            appointment,
            visit: loaded,
            origin,
            standing: standingOf(appointment),
            step: origin === 'view' ? 'view' : 'treatment',
            seq: (current?.seq ?? 0) + 1,
        }));
        setVisitOpen(true);
    }

    /**
     * The queue decides this, not the status. Everyone waiting to be seen is
     * `checked_in` and so is the patient in the chair; only the head of the
     * queue is in it, and only they can be sent on to the desk.
     */
    function standingOf(appointment: Appointment): Standing {
        // A finished visit stays finished through the edit that follows it —
        // reopening unlocks the visit and leaves the appointment alone. And a
        // day that is not today has no chair and no desk to speak of.
        if (appointment.status === 'done' || !isToday) return 'finished';
        if (appointment.status === 'awaiting_payment') return 'desk';
        return chair?.id === appointment.id ? 'chair' : 'waiting';
    }

    /**
     * Where the patient stands once they are through the door, as a phrase
     * without their name: the toast that carries it lands on their record,
     * where the name is already the largest thing on the screen.
     */
    function seated(): string {
        // Checking in no longer means going in: with the chair taken they join
        // the queue, and the message has to say which happened.
        return chair ? `waiting, ${waiting.length + 1} ahead` : 'in the chair';
    }

    /**
     * Nothing is written here. The arrival screen opens on what the booking
     * planned and its Confirm is what checks the patient in — so a tap that
     * turns out to be the wrong row costs nothing, and the day never shows
     * someone as arrived who was never confirmed.
     */
    function checkInFrom(appointment: Appointment) {
        openVisit(appointment, null, 'arrival');
    }

    function markNoShow(appointment: Appointment) {
        noShow.mutate(appointment.id, {
            onSuccess: () => {
                setToast(`${appointment.patient.name} marked as a no-show`);
                day.refetch();
            },
        });
    }

    return (
        <View style={styles.screen}>
            <DayHeader
                dateKey={dateKey}
                branches={branches.data ?? []}
                branchId={branch}
                onPickBranch={setBranchId}
                onOpenCalendar={() => setCalendar((current) => ({ open: true, seq: current.seq + 1 }))}
            />

            {reminderCount > 0 || tab === 'reminders' ? (
                <View style={styles.tabs}>
                    <SegmentedControl<DayTab>
                        accessibilityLabel="Day or reminders"
                        value={tab}
                        onChange={setTab}
                        segments={[
                            {
                                // The day being shown, not today: the pill sat
                                // on "Today" while the screen was on 18 Aug.
                                value: 'day',
                                label: `${relativeDayLabel(dateKey)} · ${appointments.length}`,
                                icon: (selected) => (
                                    <ClockIcon size={15} stroke={selected ? color.ink : color.ink2} />
                                ),
                            },
                            {
                                value: 'reminders',
                                label: `Reminders · ${reminderCount}`,
                                icon: (selected) => (
                                    <ChatIcon size={15} stroke={selected ? color.ink : color.ink2} />
                                ),
                            },
                        ]}
                    />
                </View>
            ) : null}

            {day.status === 'error' && day.error && appointments.length > 0 ? (
                <Banner
                    tone="offline"
                    live
                    message={`${describeError(day.error, 'day').title} — showing the day as it was.`}
                />
            ) : null}
            {schedule.error !== null && schedule.status !== 'success' ? (
                <Banner
                    tone="warning"
                    message="Opening hours could not be loaded — showing the usual hours."
                    action={
                        <Button
                            label="Try again"
                            variant="text"
                            size="md"
                            onPress={schedule.refetch}
                            loading={schedule.status === 'loading'}
                        />
                    }
                />
            ) : null}
            {openRow.error ? (
                <Banner
                    tone="warning"
                    message={`${describeError(openRow.error).title} — the visit could not be opened.`}
                />
            ) : null}
            {noShow.error ? <Banner tone="warning" message={describeError(noShow.error).title} /> : null}

            <View style={styles.body}>
                {tab === 'reminders' ? (
                    <Reminders
                        query={reminders}
                        refreshControl={refreshControl}
                        onOpenRecord={
                            onOpenRecord && ((patientId) => onOpenRecord(patientId, undefined, 'Reminders'))
                        }
                    />
                ) : day.status === 'loading' ? (
                    <DaySkeleton />
                ) : day.status === 'error' && day.error && appointments.length === 0 ? (
                    <RefreshView refreshControl={refreshControl}>
                        <DayError error={day.error} onRetry={day.refetch} />
                    </RefreshView>
                ) : closed ? (
                    <ClosedDay
                        dateKey={dateKey}
                        appointments={appointments}
                        onSelect={openDetail}
                        refreshControl={refreshControl}
                    />
                ) : appointments.length === 0 ? (
                    <RefreshView refreshControl={refreshControl}>
                        <DayEmpty past={dateKey < todayKey()} onBook={openBooking} elsewhere={elsewhere} />
                    </RefreshView>
                ) : (
                    <ScrollView
                        contentContainerStyle={styles.agenda}
                        showsVerticalScrollIndicator={false}
                        refreshControl={refreshControl}
                        testID="day-agenda"
                    >
                        {isToday ? <BeforeThis appointments={past} onSelect={openDetail} /> : null}

                        {delayLabel(delay) ? (
                            <View style={styles.late}>
                                <ClockIcon size={14} stroke={color.due} />
                                <View style={styles.grow}>
                                    <Text variant="footnote" weight="bold" tone="due">
                                        Running {delayLabel(delay)}
                                    </Text>
                                    {delayReason(delay) ? (
                                        <Text variant="caption" tone="muted">
                                            {delayReason(delay)} — booked times below show what they now mean.
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                        ) : null}

                        {isToday ? (
                            <NowCard
                                active={active}
                                next={next}
                                nowMinutes={nowMinutes}
                                procedure={card ? procedureLabel(card) : undefined}
                                checkedInAt={active ? arrivals.data?.get(active.id) : undefined}
                                checkingInId={checkingInId}
                                onCheckIn={checkInFrom}
                                onOpen={openDetail}
                                onOpenRecord={(patientId) => onOpenRecord?.(patientId)}
                            />
                        ) : null}

                        <UpNext
                            appointments={upcoming}
                            chairId={isToday ? (chair?.id ?? null) : null}
                            delay={delay}
                            nowMinutes={isToday ? nowMinutes : null}
                            relativeToNow={isToday}
                            checkingInId={checkingInId}
                            onSelect={openDetail}
                            onCheckIn={checkInFrom}
                            onNoShow={markNoShow}
                        />
                    </ScrollView>
                )}
            </View>

            {tab === 'day' ? <BookFab onPress={openBooking} /> : null}

            <CalendarSheet
                key={`calendar:${calendar.seq}`}
                visible={calendar.open}
                selected={dateKey}
                schedule={schedule.data}
                branches={branches.data ?? []}
                branchId={branch}
                onPick={pickDay}
                onClose={() => setCalendar((current) => ({ ...current, open: false }))}
            />

            <BookPatientSheet
                key={`book-patient:${booking.seq}`}
                visible={booking.open}
                onClose={() => setBooking((current) => ({ ...current, open: false }))}
                onPicked={(patient) => {
                    setBooking((current) => ({ ...current, open: false }));
                    setPage((current) => ({ patient, seq: (current?.seq ?? 0) + 1 }));
                    setPageOpen(true);
                    onBookingChange?.(true);
                }}
            />

            <PushView visible={pageOpen} testID="booking-page">
                {page ? (
                    <BookingScreen
                        key={`booking:${page.seq}`}
                        patient={page.patient}
                        timing={page.timing}
                        branchId={branch}
                        branches={branches.data ?? []}
                        schedule={schedule.data}
                        durationOptions={settings.data?.durationOptions ?? [15, 30, 45]}
                        defaultDuration={settings.data?.defaultDuration ?? 30}
                        dateKey={dateKey}
                        nowMinutes={nowMinutes}
                        onBack={() => {
                            setPageOpen(false);
                            onBookingChange?.(false);
                        }}
                        onBooked={(message) => {
                            setPageOpen(false);
                            onBookingChange?.(false);
                            setToast(message);
                            day.refetch();
                        }}
                    />
                ) : null}
            </PushView>

            <AppointmentDetailSheet
                key={`detail:${selected.appointment?.id ?? 'none'}`}
                visible={selected.open}
                appointment={selected.appointment}
                onClose={() => setSelected((current) => ({ ...current, open: false }))}
                onChanged={day.refetch}
                onCheckIn={checkInFrom}
                onCheckOut={(appointment, loaded) => {
                    setSelected((current) => ({ ...current, open: false }));
                    openVisit(appointment, loaded);
                }}
            />

            {/* Nested rather than swapped, so each page slides over the one
                before it and Back slides it away with that one still behind,
                scroll and all. A ternary here drew both instantly, which is
                the missing transition it looked like. A finished visit adds a
                read-only page underneath the editor; a live one starts on the
                editor and has nothing under it. */}
            <PushView visible={visitOpen} testID="visit-page">
                {visit ? (
                    <>
                        {visit.origin === 'view' && visit.visit ? (
                            <VisitViewScreen
                                key={`view:${visit.seq}`}
                                appointment={visit.appointment}
                                visit={visit.visit}
                                onBack={() => setVisitOpen(false)}
                                // The editor opens on the visit as it stands;
                                // the reopen it needs rides along with Confirm.
                                onEdit={() => setVisit({ ...visit, step: 'treatment' })}
                            />
                        ) : null}

                        <PushView visible={visit.step !== 'view'} testID="visit-treatment-page">
                            <VisitScreen
                                key={`visit:${visit.seq}:${visit.step === 'view' ? 'idle' : 'live'}`}
                                appointment={visit.appointment}
                                visit={visit.visit ?? undefined}
                                mode={visit.origin === 'arrival' ? 'arrival' : 'checkout'}
                                standing={visit.standing ?? undefined}
                                onBack={() => {
                                    if (visit.origin === 'view') {
                                        setVisit({ ...visit, step: 'view' });
                                        return;
                                    }
                                    // Backing out of an arrival wrote nothing —
                                    // they are still booked, and saying they
                                    // are in the chair would be a lie.
                                    setVisitOpen(false);
                                }}
                                onConfirm={(priced) => {
                                    // An arrival is done here: they are in the
                                    // chair or in the queue, and nothing is owed
                                    // until the work is finished.
                                    if (visit.origin === 'arrival') {
                                        setVisitOpen(false);
                                        day.refetch();
                                        // The patient is through the door and
                                        // their record is what comes next:
                                        // history, balance, what to ask them.
                                        // The shell raises the toast, because
                                        // one raised here would draw inside a
                                        // pane it is about to hide.
                                        if (onOpenRecord) {
                                            onOpenRecord(
                                                visit.appointment.patient.id,
                                                `Checked in · ${seated()}`,
                                            );
                                            return;
                                        }
                                        setToast(`${visit.appointment.patient.name} is ${seated()}`);
                                        return;
                                    }
                                    // Same for a patient still in the queue:
                                    // this was their plan being corrected, and
                                    // nothing is owed until the work is done.
                                    if (visit.standing === 'waiting') {
                                        setVisitOpen(false);
                                        setToast(`${visit.appointment.patient.name} is still waiting`);
                                        day.refetch();
                                        return;
                                    }
                                    setVisit({ ...visit, visit: priced, step: 'payment' });
                                }}
                                onSentToDesk={(message) => {
                                    setVisitOpen(false);
                                    setToast(message);
                                    day.refetch();
                                }}
                            />

                            <PushView
                                visible={visit.step === 'payment' && visit.visit !== null}
                                testID="visit-payment-page"
                            >
                                {visit.visit ? (
                                    <VisitPaymentScreen
                                        key={`payment:${visit.seq}:${visit.visit.chargedTotal}`}
                                        appointment={visit.appointment}
                                        visit={visit.visit}
                                        // Reopened from the read-only page: the
                                        // money on it is being corrected, not
                                        // collected for the first time.
                                        correcting={visit.standing === 'finished'}
                                        onBack={() => setVisit({ ...visit, step: 'treatment' })}
                                        onClosed={(message) => {
                                            setVisitOpen(false);
                                            setToast(message);
                                            day.refetch();
                                        }}
                                    />
                                ) : null}
                            </PushView>
                        </PushView>
                    </>
                ) : null}
            </PushView>

            <Toast
                visible={toast !== null}
                message={toast ?? ''}
                onDismiss={() => setToast(null)}
                offset={space[6]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    body: { flex: 1 },
    agenda: { paddingBottom: size.nav, gap: space[3] },
    tabs: { paddingHorizontal: size.gutter, paddingBottom: space[3] },
    late: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[2],
        marginHorizontal: size.gutter,
        padding: space[3],
        borderRadius: radius.lg,
        borderWidth: border.hair,
        borderColor: color.dueSoft,
        backgroundColor: color.dueSoft,
    },
    grow: { flex: 1, minWidth: 0, gap: space[0.5] },
});
