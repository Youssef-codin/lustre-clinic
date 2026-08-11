/**
 * The day view the doctor has open — `doctor-day-view.html`. It keeps the
 * secretary's header, rows and appointment sheet, and strips out everything
 * the doctor does not do: no walk-in button, no reminders tab, no check-in
 * pills. That leaves it one write, and it is the one the desk cannot make for
 * him: `checked_in → awaiting_payment`, the moment he is finished and the
 * patient goes out to pay. Everything else is a read. `arrivals` is keyed by
 * the checked-in ids rather than the date, so the queue's order is re-asked
 * when somebody arrives or leaves the chair and not on every tick of the
 * clock.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Toast } from '../../components/ui';
import { color, size, space } from '../../theme';
import { splitDoctorDay } from './chair';
import { BeforeThis } from './components/Agenda';
import { AppointmentDetailSheet } from './components/AppointmentDetailSheet';
import { CalendarSheet } from './components/CalendarSheet';
import { ChairCard, type ChairCardKind, ChairStrip } from './components/Chair';
import { CheckoutSheet } from './components/CheckoutSheet';
import { ClosedDay } from './components/ClosedDay';
import { DayHeader } from './components/DayHeader';
import { DayEmpty, DayError, DaySkeleton } from './components/DayStates';
import { AfterThis } from './components/DoctorAgenda';
import { type Appointment, api, checkInTimes, useLocalMutation, useLocalQuery, type Visit } from './data';
import { describeError } from './errors';
import { isClosed } from './hours';
import { todayKey } from './time';
import { useNowMinutes } from './useNow';

export function DoctorDayScreen() {
    const [dateKey, setDateKey] = useState(todayKey);
    const [branchId, setBranchId] = useState<string | null>(null);
    const [calendar, setCalendar] = useState({ open: false, seq: 0 });
    const [selected, setSelected] = useState<{ appointment: Appointment | null; open: boolean }>({
        appointment: null,
        open: false,
    });
    const [checkout, setCheckout] = useState<{
        target: { appointment: Appointment; visit: Visit } | null;
        open: boolean;
    }>({ target: null, open: false });
    const [toast, setToast] = useState<string | null>(null);

    const nowMinutes = useNowMinutes();

    const schedule = useLocalQuery('schedule', api.schedule);
    const branches = useLocalQuery('branches', api.branches);
    const branch = branchId ?? branches.data?.[0]?.id ?? null;
    const day = useLocalQuery(`day:${dateKey}:${branch ?? 'all'}`, () =>
        api.byDate(dateKey, branch ?? undefined),
    );

    const procedureList = useLocalQuery('procedures', api.procedures);
    const procedures = useMemo(
        () => new Map((procedureList.data ?? []).map((row) => [row.id, row.name])),
        [procedureList.data],
    );

    const appointments = day.data ?? [];
    const closed = isClosed(dateKey, schedule.data);
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

    const { chair, headline, strip, list, past } = useMemo(
        () => splitDoctorDay(appointments, arrivals.data),
        [appointments, arrivals.data],
    );

    const finish = useLocalMutation(api.awaitPayment);
    const [finishing, setFinishing] = useState<string | null>(null);
    const finishingId = finish.pending ? finishing : null;

    const kind: ChairCardKind =
        headline === null
            ? 'next'
            : headline === chair
              ? 'chair'
              : headline.status === 'checked_in'
                ? 'waiting'
                : 'next';

    const openDetail = (appointment: Appointment) => setSelected({ appointment, open: true });

    function finishVisit(appointment: Appointment) {
        setFinishing(appointment.id);
        finish.mutate(appointment.id, {
            onSuccess: () => {
                setToast(`${appointment.patient.name} is at the desk`);
                day.refetch();
            },
        });
    }

    function procedureFor(appointment: Appointment | null): string | undefined {
        return appointment?.typeId ? procedures.get(appointment.typeId) : undefined;
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
            {finish.error ? <Banner tone="warning" message={describeError(finish.error).title} /> : null}

            <View style={styles.body}>
                {day.status === 'loading' ? (
                    <DaySkeleton />
                ) : day.status === 'error' && day.error && appointments.length === 0 ? (
                    <DayError error={day.error} onRetry={day.refetch} />
                ) : closed ? (
                    <ClosedDay dateKey={dateKey} appointments={appointments} onSelect={openDetail} />
                ) : appointments.length === 0 ? (
                    <DayEmpty past={dateKey < todayKey()} />
                ) : (
                    <ScrollView
                        contentContainerStyle={styles.agenda}
                        showsVerticalScrollIndicator={false}
                        testID="doctor-agenda"
                    >
                        {isToday ? (
                            <BeforeThis appointments={past} procedures={procedures} onSelect={openDetail} />
                        ) : null}

                        {isToday && strip ? (
                            <ChairStrip
                                appointment={strip}
                                nowMinutes={nowMinutes}
                                procedure={procedureFor(strip)}
                                finishing={finishingId === strip.id}
                                onOpen={openDetail}
                                onFinish={finishVisit}
                            />
                        ) : null}

                        {isToday ? (
                            <ChairCard
                                appointment={headline}
                                kind={kind}
                                nowMinutes={nowMinutes}
                                procedure={procedureFor(headline)}
                                checkedInAt={headline ? arrivals.data?.get(headline.id) : undefined}
                                finishing={finishingId === headline?.id}
                                onOpen={openDetail}
                                onFinish={finishVisit}
                            />
                        ) : null}

                        <AfterThis
                            appointments={isToday ? list : appointments}
                            procedures={procedures}
                            relativeToNow={isToday}
                            onSelect={openDetail}
                        />
                    </ScrollView>
                )}
            </View>

            <CalendarSheet
                key={`calendar:${calendar.seq}`}
                visible={calendar.open}
                selected={dateKey}
                schedule={schedule.data}
                branchName={(branches.data ?? []).find((row) => row.id === branch)?.name}
                onPick={setDateKey}
                onClose={() => setCalendar((current) => ({ ...current, open: false }))}
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
});
