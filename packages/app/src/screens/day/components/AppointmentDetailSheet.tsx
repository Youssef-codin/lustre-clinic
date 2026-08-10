import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Callout, CardDivider, Sheet, Tag } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import {
    type Appointment,
    api,
    rememberVisit,
    useLocalMutation,
    useLocalQuery,
    type Visit,
    visitForAppointment,
} from '../data';
import { describeError } from '../errors';
import { formatTime, minutesOfDay, minutesToClock } from '../time';
import { _LocalMoneyValue } from './_LocalMoneyValue';
import { _LocalStatusPill } from './_LocalStatusPill';

/**
 * One appointment, and everything that can happen to it from here.
 *
 * The status flow is the screen (§7): booked → checked in → at the desk → done,
 * with cancel and no-show off the front. Each transition is a write across
 * Tailscale, so each has a pending state and each failure lands *in this sheet*
 * next to the button that caused it. A toast that fades is not an acceptable
 * report of a write that did not happen.
 *
 * Destructive steps confirm inline rather than in a second sheet: `Sheet` is a
 * `Modal`, and a modal over a modal is how Android's back button ends up
 * cancelling a write that is already in flight.
 */

export type AppointmentDetailSheetProps = {
    visible: boolean;
    appointment: Appointment | null;
    onClose: () => void;
    /** The day's query, so a status change is reflected behind the sheet. */
    onChanged: () => void;
    /** Hands the visit to the screen, which owns the checkout sheet. */
    onCheckOut: (appointment: Appointment, visit: Visit) => void;
};

type Confirming = 'cancel' | 'no-show' | null;

export function AppointmentDetailSheet({
    visible,
    appointment,
    onClose,
    onChanged,
    onCheckOut,
}: AppointmentDetailSheetProps) {
    const [confirming, setConfirming] = useState<Confirming>(null);

    const checkIn = useLocalMutation(api.checkIn);
    const awaitPayment = useLocalMutation(api.awaitPayment);
    const cancel = useLocalMutation(api.cancel);
    const noShow = useLocalMutation(api.markNoShow);

    const status = appointment?.status;
    const hasVisit = status === 'checked_in' || status === 'awaiting_payment' || status === 'done';

    const visit = useLocalQuery<Visit | null>(
        `visit:${appointment?.id ?? 'none'}`,
        () => (appointment ? visitForAppointment(appointment.id) : Promise.resolve(null)),
        { enabled: visible && hasVisit },
    );

    const writing = checkIn.pending || awaitPayment.pending || cancel.pending || noShow.pending;
    const writeError = checkIn.error ?? awaitPayment.error ?? cancel.error ?? noShow.error;

    function after() {
        setConfirming(null);
        onChanged();
        onClose();
    }

    if (!appointment) {
        return <Sheet visible={visible} onClose={onClose} title="Appointment" />;
    }

    const startMinutes = minutesOfDay(appointment.startsAt);

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            dismissable={!writing}
            title={appointment.patient.name}
            subtitle={`${formatTime(appointment.startsAt)} – ${minutesToClock(
                startMinutes + appointment.durationMinutes,
            )} · ${appointment.durationMinutes} min`}
            testID="appointment-detail"
            footer={
                <PrimaryAction
                    appointment={appointment}
                    visit={visit.data ?? null}
                    visitLoading={visit.status === 'loading'}
                    checkingIn={checkIn.pending}
                    onCheckIn={() =>
                        checkIn.mutate(appointment.id, {
                            onSuccess: (row) => {
                                rememberVisit(appointment.id, row.id);
                                after();
                            },
                        })
                    }
                    onCheckOut={(loaded) => onCheckOut(appointment, loaded)}
                />
            }
        >
            <View style={styles.headline}>
                <_LocalStatusPill status={appointment.status} withDot />
                {appointment.channel === 'walk_in' ? <Tag tone="muted">WALK-IN</Tag> : null}
                <Text variant="caption" tone="muted">
                    {appointment.ref}
                </Text>
            </View>

            <View style={styles.facts}>
                <Fact label="Phone" value={appointment.patient.phone} />
                {appointment.note ? <Fact label="Note" value={appointment.note} /> : null}
            </View>

            {hasVisit ? (
                <VisitPanel
                    visit={visit.data ?? null}
                    loading={visit.status === 'loading'}
                    failed={visit.status === 'error'}
                    onRetry={visit.refetch}
                />
            ) : null}

            {/* The failure sits with the action, not in a toast that leaves. */}
            {writeError ? (
                <View style={styles.error}>
                    <Callout tone="warning" title={describeError(writeError, 'check-in').title}>
                        {describeError(writeError, 'check-in').body ?? ''}
                    </Callout>
                </View>
            ) : null}

            <CardDivider />

            <SecondaryActions
                appointment={appointment}
                confirming={confirming}
                setConfirming={setConfirming}
                sendingToDesk={awaitPayment.pending}
                cancelling={cancel.pending}
                markingNoShow={noShow.pending}
                onSendToDesk={() => awaitPayment.mutate(appointment.id, { onSuccess: after })}
                onCancel={() => cancel.mutate(appointment.id, { onSuccess: after })}
                onNoShow={() => noShow.mutate(appointment.id, { onSuccess: after })}
            />
        </Sheet>
    );
}

function PrimaryAction({
    appointment,
    visit,
    visitLoading,
    checkingIn,
    onCheckIn,
    onCheckOut,
}: {
    appointment: Appointment;
    visit: Visit | null;
    visitLoading: boolean;
    checkingIn: boolean;
    onCheckIn: () => void;
    onCheckOut: (visit: Visit) => void;
}) {
    switch (appointment.status) {
        case 'booked':
            return <Button label="Check in" block loading={checkingIn} onPress={onCheckIn} />;

        case 'checked_in':
        case 'awaiting_payment':
            return (
                <Button
                    label="Check out"
                    block
                    loading={visitLoading}
                    // BLOCKED.md: without `visit.byAppointment` the id is only
                    // known for a visit this session checked in. Saying so beats
                    // a button that fails.
                    disabled={!visit && !visitLoading}
                    onPress={() => visit && onCheckOut(visit)}
                />
            );

        default:
            return null;
    }
}

function SecondaryActions({
    appointment,
    confirming,
    setConfirming,
    sendingToDesk,
    cancelling,
    markingNoShow,
    onSendToDesk,
    onCancel,
    onNoShow,
}: {
    appointment: Appointment;
    confirming: Confirming;
    setConfirming: (next: Confirming) => void;
    sendingToDesk: boolean;
    cancelling: boolean;
    markingNoShow: boolean;
    onSendToDesk: () => void;
    onCancel: () => void;
    onNoShow: () => void;
}) {
    if (appointment.status === 'checked_in') {
        return (
            <View style={styles.actions}>
                <Button
                    label="Send to the desk"
                    variant="secondary"
                    block
                    loading={sendingToDesk}
                    onPress={onSendToDesk}
                />
                <Text variant="caption" tone="muted">
                    The chair is free while they pay. It does not settle anything.
                </Text>
            </View>
        );
    }

    if (appointment.status !== 'booked') {
        return (
            <Text variant="subhead" tone="muted" style={styles.tail}>
                {appointment.status === 'done'
                    ? 'This visit is finished.'
                    : appointment.status === 'cancelled'
                      ? 'This appointment was cancelled. The slot is free.'
                      : appointment.status === 'no_show'
                        ? 'Marked as a no-show. The slot is free.'
                        : ''}
            </Text>
        );
    }

    if (confirming) {
        const isCancel = confirming === 'cancel';
        return (
            <View style={styles.actions}>
                <Text variant="headline" weight="semibold">
                    {isCancel ? 'Cancel this appointment?' : 'Mark this a no-show?'}
                </Text>
                <Text variant="subhead" tone="muted">
                    {isCancel
                        ? 'The slot goes back on the day and the patient keeps their record. Nothing is deleted.'
                        : 'They did not come. The slot goes back on the day and the visit is left unbooked.'}
                </Text>
                <View style={styles.confirmRow}>
                    <Button
                        label="Keep it"
                        variant="secondary"
                        onPress={() => setConfirming(null)}
                        style={styles.confirmKeep}
                    />
                    <Button
                        label={isCancel ? 'Cancel it' : 'No-show'}
                        variant="danger"
                        loading={isCancel ? cancelling : markingNoShow}
                        onPress={isCancel ? onCancel : onNoShow}
                        style={styles.confirmGo}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.actions}>
            <Button label="Mark no-show" variant="secondary" block onPress={() => setConfirming('no-show')} />
            <Button label="Cancel appointment" variant="text" onPress={() => setConfirming('cancel')} />
        </View>
    );
}

function VisitPanel({
    visit,
    loading,
    failed,
    onRetry,
}: {
    visit: Visit | null;
    loading: boolean;
    failed: boolean;
    onRetry: () => void;
}) {
    if (loading) {
        return (
            <View style={styles.panel}>
                <Text variant="subhead" tone="muted">
                    Loading the visit…
                </Text>
            </View>
        );
    }

    if (failed) {
        return (
            <View style={styles.panel}>
                <Text variant="subhead" tone="due">
                    The visit could not be loaded.
                </Text>
                <Button label="Try again" variant="text" size="md" onPress={onRetry} />
            </View>
        );
    }

    if (!visit) {
        return (
            <View style={styles.panel}>
                <Text variant="subhead" tone="muted">
                    This patient was checked in before the app was opened, so the visit is not to hand. Open
                    it from the visit screen to check them out.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.panel}>
            <View style={styles.money}>
                <Text variant="subhead" tone="muted">
                    Charged
                </Text>
                <_LocalMoneyValue piastres={visit.chargedTotal} />
            </View>
            <View style={styles.money}>
                <Text variant="subhead" tone="muted">
                    Paid
                </Text>
                <_LocalMoneyValue piastres={visit.paidTotal} tone="success" />
            </View>
            {visit.balance > 0 ? (
                <View style={styles.money}>
                    <Text variant="subhead" tone="muted">
                        Outstanding
                    </Text>
                    <_LocalMoneyValue piastres={visit.balance} tone="due" />
                </View>
            ) : null}
        </View>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.fact}>
            <Text variant="subhead" tone="muted" style={styles.factLabel}>
                {label}
            </Text>
            <Text variant="body" style={styles.factValue}>
                {value}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    headline: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
    facts: { marginTop: space[4], gap: space[2] },
    fact: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: space[6] },
    factLabel: { width: 96 },
    factValue: { flex: 1 },
    panel: {
        marginTop: space[4],
        padding: space[3],
        gap: space[2],
        backgroundColor: color.canvas,
        borderRadius: radius.xl,
    },
    money: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    error: { marginTop: space[4] },
    actions: { marginTop: space[4], gap: space[3] },
    confirmRow: { flexDirection: 'row', gap: space[3] },
    confirmKeep: { flex: 1 },
    confirmGo: { flex: 1.4 },
    tail: { marginTop: space[4], minHeight: size.row },
});
