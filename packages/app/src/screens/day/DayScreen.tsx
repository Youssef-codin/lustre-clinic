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
import { Banner, Button, SegmentedControl, Toast } from '../../components/ui';
import { color, size, space } from '../../theme';
import { splitDay } from './agenda';
import { splitDeskDay } from './chair';
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
import {
    type Appointment,
    api,
    checkInTimes,
    rememberVisit,
    useLocalMutation,
    useLocalQuery,
    type Visit,
} from './data';
import { describeError } from './errors';
import { isClosed } from './hours';
import { busiestBranch, holdsSlot } from './month';
import { todayKey } from './time';
import { useNowMinutes } from './useNow';

type DayTab = 'day' | 'reminders';

export function DayScreen() {
    const [dateKey, setDateKey] = useState(todayKey);
    const [tab, setTab] = useState<DayTab>('day');
    const [branchId, setBranchId] = useState<string | null>(null);
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
    const [checkingIn, setCheckingIn] = useState<string | null>(null);

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

    const procedureList = useLocalQuery('procedures', api.procedures);
    const procedures = useMemo(
        () => new Map((procedureList.data ?? []).map((row) => [row.id, row.name])),
        [procedureList.data],
    );

    const reminders = useLocalQuery('reminders', () => api.pendingReminders(todayKey()));
    const reminderCount = reminders.data?.length ?? 0;

    const checkIn = useLocalMutation(api.checkIn);
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

    // The chair is the queue's head, not whoever's slot the clock happens to be
    // inside — the doctor's screen reads it the same way, and picking by slot
    // was what had the two screens seating different patients.
    const { chair, waiting, desk, next, card } = useMemo(
        () => splitDeskDay(appointments, arrivals.data),
        [appointments, arrivals.data],
    );

    const { past, upcoming } = splitDay(appointments, isToday ? (card?.id ?? null) : null);

    // The calendar counts every branch, so a picked day carries the branch it
    // is busiest in; following it is what stops the grid promising a day the
    // day view then draws empty. A day with nothing booked carries no branch.
    const pickDay = (nextDate: string, nextBranch: string | null) => {
        setDateKey(nextDate);
        if (nextBranch) setBranchId(nextBranch);
    };

    const openWalkIn = () => setWalkIn((current) => ({ open: true, seq: current.seq + 1 }));
    const openDetail = (appointment: Appointment) => setSelected({ appointment, open: true });

    const checkingInId = checkIn.pending ? checkingIn : null;

    function checkInFrom(appointment: Appointment) {
        setCheckingIn(appointment.id);
        checkIn.mutate(appointment.id, {
            onSuccess: (visit) => {
                rememberVisit(appointment.id, visit.id);
                // Checking in no longer means going in: with the chair taken
                // they join the queue, and the toast has to say which happened.
                setToast(
                    chair
                        ? `${appointment.patient.name} is waiting — ${waiting.length + 1} ahead of them`
                        : `${appointment.patient.name} is in the chair`,
                );
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
                    <DayEmpty past={dateKey < todayKey()} onWalkIn={openWalkIn} elsewhere={elsewhere} />
                ) : (
                    <ScrollView
                        contentContainerStyle={styles.agenda}
                        showsVerticalScrollIndicator={false}
                        testID="day-agenda"
                    >
                        {isToday ? (
                            <BeforeThis appointments={past} procedures={procedures} onSelect={openDetail} />
                        ) : null}

                        {isToday ? (
                            <NowCard
                                active={desk ?? chair}
                                next={next}
                                nowMinutes={nowMinutes}
                                procedure={card?.typeId ? procedures.get(card.typeId) : undefined}
                                checkingInId={checkingInId}
                                onCheckIn={checkInFrom}
                                onOpen={openDetail}
                            />
                        ) : null}

                        <UpNext
                            appointments={upcoming}
                            procedures={procedures}
                            chairId={isToday ? (chair?.id ?? null) : null}
                            relativeToNow={isToday}
                            checkingInId={checkingInId}
                            onSelect={openDetail}
                            onCheckIn={checkInFrom}
                            onNoShow={markNoShow}
                        />
                    </ScrollView>
                )}
            </View>

            {isToday && tab === 'day' ? <WalkInFab onPress={openWalkIn} /> : null}

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
    agenda: { paddingBottom: size.nav, gap: space[3] },
    tabs: { paddingHorizontal: size.gutter, paddingBottom: space[3] },
});
