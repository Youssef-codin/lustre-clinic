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
import { Button, Chevron, Tag } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import { procedureLabel } from '../agenda';
import type { Appointment } from '../data';
import { time12 } from '../time';
import { statusLabel } from './_LocalStatusPill';
import { ArrowBackIcon, ArrowForwardIcon, CheckIcon, ClockIcon } from './icons';

export type AgendaRowProps = {
    appointment: Appointment;
    onPress: () => void;
    procedure?: string;
    dim?: boolean;
    trailing?: React.ReactNode;
    onNoShow?: () => void;
};

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
    chairBusy: boolean;
    onBlocked: (appointment: Appointment) => void;
    onCheckIn: (appointment: Appointment) => void;
    onOpen: (appointment: Appointment) => void;
};

const SHORT: Partial<Record<AppointmentStatus, string>> = {
    checked_in: 'Waiting',
    awaiting_payment: 'At desk',
};

export function CheckInButton({
    appointment,
    loading,
    chairBusy,
    onCheckIn,
    onBlocked,
    onOpen,
}: CheckInButtonProps) {
    const inside = appointment.status !== 'booked';

    return (
        <Button
            label={inside ? (SHORT[appointment.status] ?? statusLabel(appointment.status)) : 'Check in'}
            variant={inside ? 'accentSoft' : 'secondary'}
            size="md"
            loading={loading}
            icon={inside ? undefined : <CheckIcon size={13} stroke={color.ink} />}
            style={styles.pill}
            onPress={() =>
                inside ? onOpen(appointment) : chairBusy ? onBlocked(appointment) : onCheckIn(appointment)
            }
        />
    );
}

export type UpNextProps = {
    appointments: readonly Appointment[];
    chairBusy: boolean;
    relativeToNow: boolean;
    checkingInId: string | null;
    onSelect: (appointment: Appointment) => void;
    onCheckIn: (appointment: Appointment) => void;
    onNoShow: (appointment: Appointment) => void;
    onBlocked: (appointment: Appointment) => void;
};

export function UpNext({
    appointments,
    chairBusy,
    relativeToNow,
    checkingInId,
    onSelect,
    onCheckIn,
    onNoShow,
    onBlocked,
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
                    procedure={procedureLabel(appointment)}
                    onPress={() => onSelect(appointment)}
                    onNoShow={appointment.status === 'booked' ? () => onNoShow(appointment) : undefined}
                    trailing={
                        <CheckInButton
                            appointment={appointment}
                            loading={checkingInId === appointment.id}
                            chairBusy={chairBusy}
                            onBlocked={onBlocked}
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
    onSelect: (appointment: Appointment) => void;
};

export function BeforeThis({ appointments, onSelect }: BeforeThisProps) {
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
                          procedure={procedureLabel(appointment)}
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
    nameLine: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    name: { flexShrink: 1 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
    pill: { borderRadius: radius.full, paddingHorizontal: space[3] },
});
