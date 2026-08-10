import type { AppointmentStatus } from '@mawid/shared';
import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Button, Chevron, Tag } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { time12 } from '../time';
import { statusLabel } from './_LocalStatusPill';
import { ArrowBackIcon, ArrowForwardIcon, CheckIcon, ClockIcon } from './icons';

/**
 * The day as a list of rows, which is what the design draws.
 *
 * It replaces a timeline that sized each block by its duration. That timeline
 * was defensible and it was not the design: a clinic that opens at ten and
 * closes at ten is twelve hours of ruler, so the six rows that matter arrived
 * spread over three screens of empty grid with the evening's last patient below
 * the fold. The list puts the whole day in one view and gives the check-in
 * button — the thing this screen is *for* — a permanent place on every row.
 */

export type AgendaRowProps = {
    appointment: Appointment;
    onPress: () => void;
    /** The procedure behind `typeId`, when it is known. */
    procedure?: string;
    /** Settled rows are history: legible, and no longer competing. */
    dim?: boolean;
    /** The row's right-hand end — a check-in button, or a status word. */
    trailing?: React.ReactNode;
    /** Swiping the row far enough, either way, calls this. */
    onNoShow?: () => void;
};

/** How far the row has to travel before letting go marks the no-show. */
const SWIPE_THRESHOLD = 96;

export function AgendaRow({
    appointment,
    onPress,
    procedure,
    dim = false,
    trailing,
    onNoShow,
}: AgendaRowProps) {
    const slide = useRef(new Animated.Value(0)).current;
    const [armed, setArmed] = useState(false);

    /**
     * Either direction, because the row has no handedness: the list mirrors in
     * Arabic and a gesture that only worked leftwards would work backwards
     * there. The distance is what commits, not the side.
     */
    const pan = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_event, gesture) =>
                onNoShow !== undefined &&
                Math.abs(gesture.dx) > 12 &&
                Math.abs(gesture.dx) > Math.abs(gesture.dy),
            onPanResponderMove: (_event, gesture) => {
                slide.setValue(gesture.dx);
                setArmed(Math.abs(gesture.dx) >= SWIPE_THRESHOLD);
            },
            onPanResponderRelease: (_event, gesture) => {
                const commit = Math.abs(gesture.dx) >= SWIPE_THRESHOLD;
                setArmed(false);
                Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
                if (commit) onNoShow?.();
            },
            onPanResponderTerminate: () => {
                setArmed(false);
                Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
            },
        }),
    ).current;

    if (!onNoShow) return <RowBody {...{ appointment, onPress, procedure, dim, trailing }} />;

    return (
        <View style={styles.swipe} {...pan.panHandlers}>
            <View style={styles.behind} pointerEvents="none">
                <Text variant="footnote" weight="semibold" tone={armed ? 'due' : 'muted'}>
                    No-show
                </Text>
                <Text variant="footnote" weight="semibold" tone={armed ? 'due' : 'muted'}>
                    No-show
                </Text>
            </View>
            <Animated.View style={[styles.front, { transform: [{ translateX: slide }] }]}>
                <RowBody {...{ appointment, onPress, procedure, dim, trailing }} />
            </Animated.View>
        </View>
    );
}

function RowBody({ appointment, onPress, procedure, dim = false, trailing }: AgendaRowProps) {
    const { time, meridiem } = time12(appointment.startsAt);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${time} ${meridiem}, ${appointment.patient.name}, ${statusLabel(appointment.status)}`}
            onPress={onPress}
            style={({ pressed }) => [styles.row, dim && styles.dim, pressed && styles.pressed]}
        >
            <View style={styles.clock}>
                <Text variant="headline" script="mono" weight="semibold" tone={dim ? 'muted' : 'ink'}>
                    {time}
                </Text>
                <Text variant="tag" tone="muted">
                    {meridiem}
                </Text>
            </View>

            <View style={styles.body}>
                <View style={styles.nameLine}>
                    <Text
                        variant="headline"
                        weight="semibold"
                        tone={dim ? 'ink2' : 'ink'}
                        numberOfLines={1}
                        style={styles.name}
                    >
                        {appointment.patient.name}
                    </Text>
                    {appointment.channel === 'walk_in' ? <Tag tone="due">WALK-IN</Tag> : null}
                </View>

                <View style={styles.meta}>
                    <ClockIcon size={13} />
                    <Text variant="subhead" tone="muted" numberOfLines={1} style={styles.name}>
                        {/* "Check-up · 20 min" where the procedure is known,
                            the duration alone where it is not — an appointment
                            booked without a type is a real row, not a gap. */}
                        {procedure
                            ? `${procedure} · ${appointment.durationMinutes} min`
                            : `${appointment.durationMinutes} min`}
                    </Text>
                </View>
            </View>

            {trailing}
        </Pressable>
    );
}

export type CheckInButtonProps = {
    appointment: Appointment;
    loading: boolean;
    /** Somebody is in the chair, so the next patient cannot go in yet. */
    chairBusy: boolean;
    onCheckIn: (appointment: Appointment) => void;
    onOpen: (appointment: Appointment) => void;
};

/**
 * Pill-length words for the states the pill can be in. `statusLabel`'s "In the
 * chair" is a sentence and this is 60px wide; the row already says which patient
 * it is about, so the pill only has to say where they are.
 */
const SHORT: Partial<Record<AppointmentStatus, string>> = {
    // "In the chair" is the card's word, and the card is drawn for exactly one
    // patient. A checked-in row is therefore someone who has arrived and is
    // sitting in the waiting room, which is what it should say.
    checked_in: 'Waiting',
    awaiting_payment: 'At desk',
};

/**
 * The pill on the right of every row still to happen. Outlined until they are
 * in, filled once they are — the design's two states, and the only control the
 * secretary needs to hit without opening anything.
 *
 * Once they are in, the same pill opens the visit rather than going inert: a
 * checked-in row's next move is checking out, and a dead control in the place
 * the finger already goes is worse than no control.
 */
export function CheckInButton({ appointment, loading, chairBusy, onCheckIn, onOpen }: CheckInButtonProps) {
    const inside = appointment.status !== 'booked';

    return (
        <Button
            label={inside ? (SHORT[appointment.status] ?? statusLabel(appointment.status)) : 'Check in'}
            variant={inside ? 'accentSoft' : 'secondary'}
            size="md"
            loading={loading}
            disabled={!inside && chairBusy}
            icon={inside ? undefined : <CheckIcon size={13} stroke={color.ink} />}
            style={styles.pill}
            onPress={() => (inside ? onOpen(appointment) : onCheckIn(appointment))}
        />
    );
}

export type UpNextProps = {
    appointments: readonly Appointment[];
    /** Procedure name by `typeId`. Empty until `procedure.list` answers. */
    procedures: ReadonlyMap<string, string>;
    chairBusy: boolean;
    /** False on any day but today, where "after this" has nothing to be after. */
    relativeToNow: boolean;
    checkingInId: string | null;
    onSelect: (appointment: Appointment) => void;
    onCheckIn: (appointment: Appointment) => void;
    onNoShow: (appointment: Appointment) => void;
};

export function UpNext({
    appointments,
    procedures,
    chairBusy,
    relativeToNow,
    checkingInId,
    onSelect,
    onCheckIn,
    onNoShow,
}: UpNextProps) {
    if (appointments.length === 0) return null;

    return (
        <View style={[styles.section, styles.upNext]}>
            <View style={styles.sectionLabel}>
                <ArrowForwardIcon size={13} />
                <Text variant="eyebrow" tone="muted">
                    {`${relativeToNow ? 'AFTER THIS' : 'THE DAY'} · ${appointments.length}`}
                </Text>
            </View>

            {appointments.map((appointment) => (
                <AgendaRow
                    key={appointment.id}
                    appointment={appointment}
                    procedure={procedureName(procedures, appointment)}
                    onPress={() => onSelect(appointment)}
                    onNoShow={appointment.status === 'booked' ? () => onNoShow(appointment) : undefined}
                    trailing={
                        <CheckInButton
                            appointment={appointment}
                            loading={checkingInId === appointment.id}
                            chairBusy={chairBusy}
                            onCheckIn={onCheckIn}
                            onOpen={onSelect}
                        />
                    }
                />
            ))}
        </View>
    );
}

export type BeforeThisProps = {
    appointments: readonly Appointment[];
    procedures: ReadonlyMap<string, string>;
    onSelect: (appointment: Appointment) => void;
};

/** Undefined rather than empty, so the row falls back to the duration alone. */
function procedureName(
    procedures: ReadonlyMap<string, string>,
    appointment: Appointment,
): string | undefined {
    return appointment.typeId ? procedures.get(appointment.typeId) : undefined;
}

/**
 * What has already happened, folded away. Closed by default because it is
 * settled by definition — it opens when somebody is checking rather than
 * working.
 */
export function BeforeThis({ appointments, procedures, onSelect }: BeforeThisProps) {
    const [open, setOpen] = useState(false);

    if (appointments.length === 0) return null;

    return (
        <View style={styles.section}>
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`Before this, ${appointments.length} appointments`}
                onPress={() => setOpen((current) => !current)}
                style={({ pressed }) => [styles.sectionLabel, styles.fold, pressed && styles.pressed]}
            >
                <ArrowBackIcon size={13} />
                <Text variant="eyebrow" tone="muted">
                    {`BEFORE THIS · ${appointments.length}`}
                </Text>
                <View style={styles.spacer} />
                <Chevron direction={open ? 'up' : 'down'} size={7} />
            </Pressable>

            {open
                ? appointments.map((appointment) => (
                      <AgendaRow
                          key={appointment.id}
                          appointment={appointment}
                          procedure={procedureName(procedures, appointment)}
                          onPress={() => onSelect(appointment)}
                          dim
                          trailing={
                              <Text
                                  variant="footnote"
                                  weight="semibold"
                                  tone={appointment.status === 'done' ? 'muted' : 'due'}
                              >
                                  {statusLabel(appointment.status)}
                              </Text>
                          }
                      />
                  ))
                : null}
        </View>
    );
}

const styles = StyleSheet.create({
    section: { paddingHorizontal: size.gutter },
    upNext: { marginTop: space[2] },
    sectionLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1.5],
        minHeight: space[6],
    },
    fold: { minHeight: size.row },
    spacer: { flex: 1 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3.5],
        paddingVertical: space[3],
        minHeight: size.row,
        borderBottomWidth: border.hair,
        borderBottomColor: color.line,
    },
    dim: { opacity: 0.72 },
    swipe: { position: 'relative' },
    // The word sits under the row on both sides, so whichever way it goes the
    // gesture explains itself before it commits.
    behind: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space[4],
    },
    front: { backgroundColor: color.canvas },
    pressed: { backgroundColor: color.surface2 },
    // Wide enough for `12:45` in DM Mono with its meridiem beside it.
    clock: { width: 62, flexDirection: 'row', alignItems: 'baseline', gap: space[0.5] },
    body: { flex: 1, gap: space[0.5] },
    nameLine: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    name: { flexShrink: 1 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    pill: { borderRadius: radius.full, paddingHorizontal: space[3] },
});
