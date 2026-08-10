import { SLOT_HOLDING_STATUSES } from '@mawid/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Toast } from '../../components/ui';
import { color, space } from '../../theme';
import { AppointmentDetailSheet } from './components/AppointmentDetailSheet';
import { CalendarSheet } from './components/CalendarSheet';
import { CheckoutSheet } from './components/CheckoutSheet';
import { ClosedDay } from './components/ClosedDay';
import { DayHeader } from './components/DayHeader';
import { DayEmpty, DayError, DaySkeleton } from './components/DayStates';
import { NowCard } from './components/NowCard';
import { Timeline } from './components/Timeline';
import { WalkInFab } from './components/WalkInFab';
import { WalkInSheet } from './components/WalkInSheet';
import {
    type Appointment,
    api,
    rememberVisit,
    useLocalMutation,
    useLocalQuery,
    usingFixtures,
    type Visit,
} from './data';
import { describeError } from './errors';
import { isClosed, timelineBounds } from './hours';
import { addDays, localOffsetMinutes, minutesOfDay, todayKey } from './time';
import { useNowMinutes } from './useNow';

/**
 * The day view — the screen the secretary has open all day.
 *
 * It answers three questions, in the order they are asked: who is in the chair
 * (the black card), what does the rest of the day look like (the timeline), and
 * what is happening on some other day (the calendar). Everything else — check
 * in, send to the desk, check out, cancel, no-show, walk-in — hangs off a tap
 * on one of those.
 *
 * Two rules run through the whole file. Every list has a loading state, an
 * error state and an empty state, because a screen that shows nothing while it
 * loads is indistinguishable from a quiet Tuesday. And every write reports what
 * happened to it, in place: the clinic PC is across Tailscale and it goes down
 * with the power, so silence is the one thing a write is never allowed to be.
 */

export function DayScreen() {
    const [dateKey, setDateKey] = useState(todayKey);
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

    const nowMinutes = useNowMinutes();
    const offsetMinutes = localOffsetMinutes();

    const schedule = useLocalQuery('schedule', api.schedule);
    const settings = useLocalQuery('settings', api.settings);
    const branches = useLocalQuery('branches', api.branches);
    const day = useLocalQuery(`day:${dateKey}`, () => api.byDate(dateKey, offsetMinutes));

    const checkIn = useLocalMutation(api.checkIn);

    const appointments = day.data ?? [];
    const closed = isClosed(dateKey, schedule.data);
    const isToday = dateKey === todayKey();

    const holding = appointments.filter((row) =>
        (SLOT_HOLDING_STATUSES as readonly string[]).includes(row.status),
    );

    const bounds = timelineBounds(
        dateKey,
        schedule.data,
        appointments.map((row) => {
            const startMinutes = minutesOfDay(row.startsAt);
            return { startMinutes, endMinutes: startMinutes + row.durationMinutes };
        }),
    );

    // Who the card is about. In the chair beats at the desk beats next up —
    // whoever is physically in the room is the more urgent fact.
    const active =
        appointments.find((row) => row.status === 'checked_in') ??
        appointments.find((row) => row.status === 'awaiting_payment') ??
        null;

    const next =
        appointments
            .filter((row) => row.status === 'booked')
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;

    const openWalkIn = () => setWalkIn((current) => ({ open: true, seq: current.seq + 1 }));
    const openDetail = (appointment: Appointment) => setSelected({ appointment, open: true });

    function checkInFrom(appointment: Appointment) {
        checkIn.mutate(appointment.id, {
            onSuccess: (visit) => {
                rememberVisit(appointment.id, visit.id);
                setToast(`${appointment.patient.name} is in the chair`);
                day.refetch();
            },
        });
    }

    return (
        <View style={styles.screen}>
            <DayHeader
                dateKey={dateKey}
                summary={summaryFor(day.status, holding.length, closed)}
                onPrevious={() => setDateKey(addDays(dateKey, -1))}
                onNext={() => setDateKey(addDays(dateKey, 1))}
                onToday={() => setDateKey(todayKey())}
                onOpenCalendar={() => setCalendar((current) => ({ open: true, seq: current.seq + 1 }))}
            />

            {/* Standing conditions, above the day rather than over it. */}
            {usingFixtures ? (
                <Banner tone="info" message="Demo data — no clinic server is configured on this build." />
            ) : null}
            {day.status === 'error' && day.error && appointments.length > 0 ? (
                <Banner
                    tone="offline"
                    live
                    message={`${describeError(day.error, 'day').title} — showing the day as it was.`}
                />
            ) : null}
            {checkIn.error ? (
                <Banner tone="warning" message={describeError(checkIn.error, 'check-in').title} />
            ) : null}

            {isToday && !closed ? (
                <NowCard
                    active={active}
                    next={next}
                    nowMinutes={nowMinutes}
                    checkingInId={checkIn.pending ? (next?.id ?? null) : null}
                    onCheckIn={checkInFrom}
                    onOpen={openDetail}
                />
            ) : null}

            <View style={styles.body}>
                {day.status === 'loading' ? (
                    <DaySkeleton />
                ) : day.status === 'error' && day.error && appointments.length === 0 ? (
                    <DayError error={day.error} onRetry={day.refetch} retrying={day.refreshing} />
                ) : closed ? (
                    <ClosedDay dateKey={dateKey} appointments={appointments} onSelect={openDetail} />
                ) : appointments.length === 0 ? (
                    <DayEmpty past={dateKey < todayKey()} onWalkIn={openWalkIn} />
                ) : (
                    <Timeline
                        appointments={appointments}
                        bounds={bounds}
                        nowMinutes={isToday ? nowMinutes : null}
                        onSelect={openDetail}
                    />
                )}
            </View>

            {/* A walk-in starts now, so it only makes sense on today. */}
            {isToday ? <WalkInFab onPress={openWalkIn} /> : null}

            <CalendarSheet
                key={`calendar:${calendar.seq}`}
                visible={calendar.open}
                selected={dateKey}
                schedule={schedule.data}
                onPick={setDateKey}
                onClose={() => setCalendar((current) => ({ ...current, open: false }))}
            />

            <WalkInSheet
                key={`walk-in:${walkIn.seq}`}
                visible={walkIn.open}
                branchId={branches.data?.[0]?.id ?? null}
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

function summaryFor(status: string, count: number, closed: boolean): string {
    if (status === 'loading') return 'Loading…';
    if (status === 'error') return 'Could not load';
    if (closed) return 'Closed';
    if (count === 0) return 'Nothing booked';
    return count === 1 ? '1 appointment' : `${count} appointments`;
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },
    body: { flex: 1 },
});
