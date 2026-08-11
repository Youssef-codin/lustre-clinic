/**
 * The day as a list of rows, replacing a duration-sized timeline that spread
 * the day over screens of empty grid. The swipe works either way because the
 * list mirrors in Arabic — the distance commits, not the side. The checked-in
 * pill reads "Waiting" (the card says "In the chair" for exactly one patient),
 * stays legible when the chair is busy rather than disabled, and opens the
 * visit once checked in instead of going inert. An unknown procedure renders
 * `undefined` so the row falls back to the duration alone.
 */
import type { AppointmentStatus } from '@mawid/shared';
import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Button, Chevron } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { time12 } from '../time';
import { statusLabel } from './_LocalStatusPill';
import {
    ArrowBackIcon,
    ArrowForwardIcon,
    ChairIcon,
    CheckIcon,
    ClockIcon,
    PaymentIcon,
    WaitingIcon,
} from './icons';

export type AgendaRowProps = {
    appointment: Appointment;
    onPress: () => void;
    procedure?: string;
    dim?: boolean;
    /** The one seated patient — blue, where the queue behind them is orange. */
    inChair?: boolean;
    trailing?: React.ReactNode;
    onNoShow?: () => void;
};

const SWIPE_THRESHOLD = 96;

export function AgendaRow({
    appointment,
    onPress,
    procedure,
    dim = false,
    inChair = false,
    trailing,
    onNoShow,
}: AgendaRowProps) {
    const slide = useRef(new Animated.Value(0)).current;
    const [armed, setArmed] = useState(false);

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

    if (!onNoShow) return <RowBody {...{ appointment, onPress, procedure, dim, inChair, trailing }} />;

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
                <RowBody {...{ appointment, onPress, procedure, dim, inChair, trailing }} />
            </Animated.View>
        </View>
    );
}

/**
 * Where the patient is, as the row's own fill — the button says what to do next
 * and keeps one colour, so the state has to live somewhere else. Waiting is due
 * — orange, a queue building — and the one seated patient is accent, so the
 * chair reads as apart from the people waiting on it.
 */
const CHAIR_TINT = color.accentSoft;

const TINT: Partial<Record<AppointmentStatus, string>> = {
    checked_in: color.dueSoft,
    awaiting_payment: color.accentSoft,
};

function RowBody({
    appointment,
    onPress,
    procedure,
    dim = false,
    inChair = false,
    trailing,
}: AgendaRowProps) {
    const { time, meridiem } = time12(appointment.startsAt);
    const tint = dim ? undefined : inChair ? CHAIR_TINT : TINT[appointment.status];

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${time} ${meridiem}, ${appointment.patient.name}, ${statusLabel(appointment.status)}`}
            onPress={onPress}
            style={({ pressed }) => [
                styles.row,
                dim && styles.dim,
                tint && [styles.tinted, { backgroundColor: tint }],
                pressed && styles.pressed,
            ]}
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
                <Text
                    variant="headline"
                    weight="semibold"
                    tone={dim ? 'ink2' : 'ink'}
                    numberOfLines={1}
                    style={styles.name}
                >
                    {appointment.patient.name}
                </Text>

                <View style={styles.meta}>
                    <ClockIcon size={13} />
                    <Text variant="subhead" tone="muted" numberOfLines={1} style={styles.name}>
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

export type CheckInControlProps = {
    appointment: Appointment;
    loading: boolean;
    /** `checked_in` is arrived, not seated — only the queue's head reads as IN. */
    inChair: boolean;
    onCheckIn: (appointment: Appointment) => void;
};

const SHORT: Partial<Record<AppointmentStatus, string>> = {
    checked_in: 'Waiting',
    awaiting_payment: 'At desk',
};

/**
 * Check in is the only thing to press out here — once the patient is inside,
 * the row itself opens the visit, so the trailing slot drops to a chip that
 * only says where they are. A button that repeats the row's own tap reads as a
 * second, different action; the chip takes the button's width so the states
 * still line up down the column.
 */
export function CheckInControl({ appointment, loading, inChair, onCheckIn }: CheckInControlProps) {
    if (appointment.status === 'booked') {
        return (
            <Button
                label="Check in"
                variant="secondary"
                size="md"
                loading={loading}
                icon={<CheckIcon size={13} stroke={color.ink} />}
                style={styles.pill}
                onPress={() => onCheckIn(appointment)}
            />
        );
    }

    const label = inChair ? 'In chair' : (SHORT[appointment.status] ?? statusLabel(appointment.status));
    const seated = inChair || appointment.status === 'awaiting_payment';
    const tone = seated ? color.accent : color.due;
    const Icon = inChair ? ChairIcon : appointment.status === 'awaiting_payment' ? PaymentIcon : WaitingIcon;

    return (
        <View style={styles.chip} pointerEvents="none">
            <Icon size={13} stroke={tone} />
            <Text variant="callout" weight="semibold" tone={seated ? 'accent' : 'due'}>
                {label}
            </Text>
        </View>
    );
}

export type UpNextProps = {
    appointments: readonly Appointment[];
    procedures: ReadonlyMap<string, string>;
    chairId: string | null;
    relativeToNow: boolean;
    checkingInId: string | null;
    onSelect: (appointment: Appointment) => void;
    onCheckIn: (appointment: Appointment) => void;
    onNoShow: (appointment: Appointment) => void;
};

export function UpNext({
    appointments,
    procedures,
    chairId,
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
                    inChair={appointment.id === chairId}
                    onNoShow={appointment.status === 'booked' ? () => onNoShow(appointment) : undefined}
                    trailing={
                        <CheckInControl
                            appointment={appointment}
                            loading={checkingInId === appointment.id}
                            inChair={appointment.id === chairId}
                            onCheckIn={onCheckIn}
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

function procedureName(
    procedures: ReadonlyMap<string, string>,
    appointment: Appointment,
): string | undefined {
    return appointment.typeId ? procedures.get(appointment.typeId) : undefined;
}

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
                style={({ pressed }) => [styles.sectionLabel, pressed && styles.pressed]}
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
    tinted: {
        paddingHorizontal: space[3],
        marginHorizontal: -space[2],
        borderRadius: radius.lg,
        borderBottomColor: 'transparent',
    },
    swipe: { position: 'relative' },
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
    clock: { width: 62, flexDirection: 'row', alignItems: 'baseline', gap: space[0.5] },
    body: { flex: 1, gap: space[0.5] },
    name: { flexShrink: 1 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    /** One width for every state, so the column of controls reads as a column. */
    pill: { borderRadius: radius.full, paddingHorizontal: space[3], minWidth: 118 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        minWidth: 118,
        minHeight: size.row,
        paddingHorizontal: space[3],
    },
});
