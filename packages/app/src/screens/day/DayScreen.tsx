import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, SegmentedControl, Toast } from '../../components/ui';
import { color, size, space } from '../../theme';
import { splitDay } from './agenda';
import { BeforeThis, UpNext } from './components/Agenda';
import { AppointmentDetailSheet } from './components/AppointmentDetailSheet';
import { CalendarSheet } from './components/CalendarSheet';
import { CheckoutSheet } from './components/CheckoutSheet';
import { ClosedDay } from './components/ClosedDay';
import { DayHeader } from './components/DayHeader';
import { DayEmpty, DayError, DaySkeleton } from './components/DayStates';
import { ChatIcon, ClockIcon } from './components/icons';
import { NowCard } from './components/NowCard';
import { Reminders } from './components/Reminders';
import { WalkInFab } from './components/WalkInFab';
import { WalkInSheet } from './components/WalkInSheet';
import { type Appointment, api, rememberVisit, useLocalMutation, useLocalQuery, type Visit } from './data';
import { describeError } from './errors';
import { isClosed } from './hours';
import { minutesOfDay, todayKey } from './time';
import { useNowMinutes } from './useNow';

/**
 * The day view — the screen the secretary has open all day.
 *
 * It answers three questions, in the order `day-view-schedule.html` asks them:
 * what has already happened (folded away), who is in the chair (the black
 * card), and what is still to come (the list under it). What is happening on
 * some other day is the calendar, behind the date pill. Everything else — check
 * in, send to the desk, check out, cancel, no-show, walk-in — hangs off a tap
 * on one of those.
 *
 * Two rules run through the whole file. Every list has a loading state, an
 * error state and an empty state, because a screen that shows nothing while it
 * loads is indistinguishable from a quiet Tuesday. And every write reports what
 * happened to it, in place: the clinic PC is across Tailscale and it goes down
 * with the power, so silence is the one thing a write is never allowed to be.
 */

type DayTab = 'day' | 'reminders';

export function DayScreen() {
    const [dateKey, setDateKey] = useState(todayKey);
    const [tab, setTab] = useState<DayTab>('day');
    const [branchId, setBranchId] = useState<string | null>(null);
    // Both sheets keep drafts — a pending date, a half-typed patient. The
    // counter is their reset: it changes on open, so each opening is a fresh
    // sheet, and it holds still on close, so the exit still animates.
    const [calendar, setCalendar] = useState({ open: false, seq: 0 });
    const [walkIn, setWalkIn] = useState({ open: false, seq: 0 });
    const [selected, setSelected] = useState<{ appointment: Appointment | null; open: boolean }>({
        appointment: null,
        open: false,
    });
    const [checkout, setCheckout] = useState<{
        target: { appointment: Appointment; visit: Visit } | null;
        open: boolean;
    }>({ target: null, open: false });
    const [toast, setToast] = useState<string | null>(null);
    // Which row's button is spinning. `pending` alone would spin every button
    // on the list, and the design puts one on every row.
    const [checkingIn, setCheckingIn] = useState<string | null>(null);

    const nowMinutes = useNowMinutes();

    const schedule = useLocalQuery('schedule', api.schedule);
    const settings = useLocalQuery('settings', api.settings);
    const branches = useLocalQuery('branches', api.branches);
    const branch = branchId ?? branches.data?.[0]?.id ?? null;
    const day = useLocalQuery(`day:${dateKey}:${branch ?? 'all'}`, () =>
        api.byDate(dateKey, branch ?? undefined),
    );

    // The names behind `typeId`. One list for the whole clinic, so it is
    // fetched once and read by every row rather than joined per appointment.
    const procedureList = useLocalQuery('procedures', api.procedures);
    const procedures = useMemo(
        () => new Map((procedureList.data ?? []).map((row) => [row.id, row.name])),
        [procedureList.data],
    );

    // §11 — what is owed a message. Not scoped to the day on screen: a reminder
    // falls due a lead time before its appointment, so the list is about the
    // clinic's outstanding work, not about this date.
    const reminders = useLocalQuery('reminders', () => api.pendingReminders(todayKey()));
    const reminderCount = reminders.data?.length ?? 0;

    const checkIn = useLocalMutation(api.checkIn);
    const noShow = useLocalMutation(api.markNoShow);

    const appointments = day.data ?? [];
    const closed = isClosed(dateKey, schedule.data);
    const isToday = dateKey === todayKey();

    // Who the card is about. In the chair beats at the desk beats next up —
    // whoever is physically in the room is the more urgent fact.
    //
    // Two patients can be checked in at once: their slots do not overlap, so
    // nothing stops the eleven o'clock being checked in while the ten o'clock is
    // still in the chair. The one whose slot contains now is the one in the
    // room; failing that, the one checked in most recently.
    const inChair = appointments.filter((row) => row.status === 'checked_in');
    const active =
        inChair.find((row) => {
            const startMinutes = minutesOfDay(row.startsAt);
            return nowMinutes >= startMinutes && nowMinutes < startMinutes + row.durationMinutes;
        }) ??
        [...inChair].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] ??
        appointments.find((row) => row.status === 'awaiting_payment') ??
        null;

    const next =
        appointments
            .filter((row) => row.status === 'booked')
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;

    // The chair is drawn once, at the top. Everything else is either settled —
    // behind the fold — or still to come.
    const { past, upcoming } = splitDay(appointments, isToday ? (active?.id ?? null) : null);

    const openWalkIn = () => setWalkIn((current) => ({ open: true, seq: current.seq + 1 }));
    const openDetail = (appointment: Appointment) => setSelected({ appointment, open: true });

    const checkingInId = checkIn.pending ? checkingIn : null;

    function checkInFrom(appointment: Appointment) {
        setCheckingIn(appointment.id);
        checkIn.mutate(appointment.id, {
            onSuccess: (visit) => {
                rememberVisit(appointment.id, visit.id);
                setToast(`${appointment.patient.name} is in the chair`);
                day.refetch();
            },
        });
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

            {/* The design's two halves of this screen: the day itself, and the
                messages it owes. Drawn only when there is something to say —
                a segmented control over one segment is a label. */}
            {/* `tab` keeps it alive once the last reminder is marked, so the
                pane that just emptied still has a way back to the day. */}
            {reminderCount > 0 || tab === 'reminders' ? (
                <View style={styles.tabs}>
                    <SegmentedControl<DayTab>
                        accessibilityLabel="Day or reminders"
                        value={tab}
                        onChange={setTab}
                        segments={[
                            {
                                value: 'day',
                                label: `Today · ${appointments.length}`,
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

            {/* Standing conditions, above the day rather than over it. */}
            {day.status === 'error' && day.error && appointments.length > 0 ? (
                <Banner
                    tone="offline"
                    live
                    message={`${describeError(day.error, 'day').title} — showing the day as it was.`}
                />
            ) : null}
            {/* An unloaded schedule and an unconfigured one produce the same
                default hours, and they are not the same fact: the second is the
                clinic's own guess, the first is this screen's. Unsaid, a Friday
                the clinic is shut renders as a working day nobody questions. */}
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
            {checkIn.error ? (
                <Banner tone="warning" message={describeError(checkIn.error, 'check-in').title} />
            ) : null}
            {noShow.error ? <Banner tone="warning" message={describeError(noShow.error).title} /> : null}

            <View style={styles.body}>
                {tab === 'reminders' ? (
                    <Reminders query={reminders} />
                ) : day.status === 'loading' ? (
                    <DaySkeleton />
                ) : day.status === 'error' && day.error && appointments.length === 0 ? (
                    <DayError error={day.error} onRetry={day.refetch} />
                ) : closed ? (
                    <ClosedDay dateKey={dateKey} appointments={appointments} onSelect={openDetail} />
                ) : appointments.length === 0 ? (
                    <DayEmpty past={dateKey < todayKey()} onWalkIn={openWalkIn} />
                ) : (
                    <ScrollView
                        contentContainerStyle={styles.agenda}
                        showsVerticalScrollIndicator={false}
                        testID="day-agenda"
                    >
                        {/* The screen reads down in the order the day happened:
                            what is settled, who is in the chair, what is left. */}
                        {isToday ? (
                            <BeforeThis appointments={past} procedures={procedures} onSelect={openDetail} />
                        ) : null}

                        {isToday ? (
                            <NowCard
                                active={active}
                                next={next}
                                nowMinutes={nowMinutes}
                                procedure={active?.typeId ? procedures.get(active.typeId) : undefined}
                                checkingInId={checkingInId}
                                onCheckIn={checkInFrom}
                                onOpen={openDetail}
                            />
                        ) : null}

                        <UpNext
                            appointments={upcoming}
                            procedures={procedures}
                            chairBusy={active?.status === 'checked_in'}
                            relativeToNow={isToday}
                            checkingInId={checkingInId}
                            onSelect={openDetail}
                            onCheckIn={checkInFrom}
                            onNoShow={markNoShow}
                            onBlocked={() =>
                                setToast('Finish the visit in the chair before checking anyone else in')
                            }
                        />
                    </ScrollView>
                )}
            </View>

            {/* A walk-in starts now, so it only makes sense on today — and it
                books into the day, not into the reminder list. */}
            {isToday && tab === 'day' ? <WalkInFab onPress={openWalkIn} /> : null}

            <CalendarSheet
                key={`calendar:${calendar.seq}`}
                visible={calendar.open}
                selected={dateKey}
                schedule={schedule.data}
                branchName={(branches.data ?? []).find((row) => row.id === branch)?.name}
                onPick={setDateKey}
                onClose={() => setCalendar((current) => ({ ...current, open: false }))}
            />

            <WalkInSheet
                key={`walk-in:${walkIn.seq}`}
                visible={walkIn.open}
                branchId={branch}
                durationOptions={settings.data?.durationOptions ?? [15, 30, 45]}
                defaultDuration={settings.data?.defaultDuration ?? 30}
                onClose={() => setWalkIn((current) => ({ ...current, open: false }))}
                onCreated={(message) => {
                    setToast(message);
                    day.refetch();
                }}
            />

            {/* Keyed by the appointment, so a half-finished confirm or a failed
                write belongs to the patient it was about and cannot be inherited
                by the next one opened. The row is held through the close so the
                sheet animates out with its content, rather than emptying first. */}
            <AppointmentDetailSheet
                key={`detail:${selected.appointment?.id ?? 'none'}`}
                visible={selected.open}
                appointment={selected.appointment}
                onClose={() => setSelected((current) => ({ ...current, open: false }))}
                onChanged={day.refetch}
                onCheckOut={(appointment, visit) => {
                    setSelected((current) => ({ ...current, open: false }));
                    setCheckout({ target: { appointment, visit }, open: true });
                }}
            />

            <CheckoutSheet
                key={`checkout:${checkout.target?.visit.id ?? 'none'}`}
                visible={checkout.open}
                appointment={checkout.target?.appointment ?? null}
                visit={checkout.target?.visit ?? null}
                onClose={() => setCheckout((current) => ({ ...current, open: false }))}
                onDone={(message) => {
                    setToast(message);
                    day.refetch();
                }}
            />

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
    // Clear of the FAB, which floats over the end of the list.
    agenda: { paddingBottom: size.nav, gap: space[3] },
    tabs: { paddingHorizontal: size.gutter, paddingBottom: space[3] },
});
