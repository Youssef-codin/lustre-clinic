import { StyleSheet, View } from 'react-native';
import { Button, Dot, ProgressBar } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import type { Appointment } from '../data';
import { formatTime, minutesOfDay, minutesToClock, time12 } from '../time';
import { CheckIcon, ClockIcon } from './icons';

/**
 * The chair, at the top of the screen — the black card from
 * `day-view-schedule.html`.
 *
 * The list answers "what does today look like"; this answers "what is happening
 * right now", which is the question the secretary actually has all day. It has
 * three states because the clinic has three: someone in the chair or at the
 * desk, someone due next, and nobody.
 */

export type NowCardProps = {
    /** The patient in the chair, or at the desk. */
    active: Appointment | null;
    /** The next appointment still to arrive, if any. */
    next: Appointment | null;
    nowMinutes: number;
    /** The procedure behind the active row's `typeId`, when it is known. */
    procedure?: string;
    onCheckIn: (appointment: Appointment) => void;
    onOpen: (appointment: Appointment) => void;
    checkingInId: string | null;
};

/**
 * How far into the slot the clinic is.
 *
 * Against the *slot*, not against the patient: `checked_in` says nothing about
 * when they actually sat down (`checked_in_at` is on the visit, which this card
 * does not hold), so a bar presented as time in the chair would be a number the
 * secretary acts on and it would be wrong. Both halves of the label name the
 * slot, and past its end the bar stops filling and says so.
 */
function slotProgress(appointment: Appointment, nowMinutes: number) {
    const start = minutesOfDay(appointment.startsAt);
    const elapsed = nowMinutes - start;
    const duration = appointment.durationMinutes;
    const over = elapsed - duration;

    return {
        value: duration > 0 ? elapsed / duration : 0,
        over: over > 0,
        label: over > 0 ? overLabel(over) : `${Math.max(elapsed, 0)} / ${duration} min`,
        window: `${formatTime(appointment.startsAt)} – ${minutesToClock(start + duration)}`,
    };
}

function overLabel(over: number): string {
    return over < 60 ? `${over} min over` : `${Math.floor(over / 60)}h ${over % 60}m over`;
}

/** The eyebrow's right-hand end: when the slot began. */
function StartedAt({ appointment }: { appointment: Appointment }) {
    const { time, meridiem } = time12(appointment.startsAt);
    return (
        <Text variant="eyebrow" tone="muted" style={styles.startedAt}>
            {`${time} ${meridiem}`}
        </Text>
    );
}

export function NowCard({
    active,
    next,
    nowMinutes,
    procedure,
    onCheckIn,
    onOpen,
    checkingInId,
}: NowCardProps) {
    if (active) {
        const inChair = active.status === 'checked_in';
        const progress = slotProgress(active, nowMinutes);

        return (
            <View style={styles.card}>
                <View style={styles.eyebrowRow}>
                    <Dot tone={inChair ? 'live' : 'due'} size={7} pulse={inChair} />
                    <Text variant="eyebrow" tone={inChair ? 'live' : 'due'}>
                        {inChair ? 'IN THE CHAIR' : 'AT THE DESK'}
                    </Text>
                    <StartedAt appointment={active} />
                </View>

                <Text variant="title" weight="semibold" tone="inverse" numberOfLines={1} style={styles.name}>
                    {active.patient.name}
                </Text>

                <View style={styles.detail}>
                    <ClockIcon />
                    <Text variant="callout" tone="muted" numberOfLines={1} style={styles.detailText}>
                        {/* What is being done, which is what the design puts
                            here. The note is the more specific answer when
                            somebody wrote one; the slot window is the fallback
                            for an appointment booked without a type. */}
                        {active.note ?? procedure ?? progress.window}
                    </Text>
                </View>

                {inChair ? (
                    <View style={styles.progress}>
                        {/* The bar stretches to its own container: `ProgressBar`
                            sizes itself with `alignSelf`, which in a row means
                            nothing at all. */}
                        <View style={styles.track}>
                            <ProgressBar
                                value={progress.value}
                                tone={progress.over ? 'due' : 'live'}
                                height={5}
                                onDark
                                accessibilityLabel="Time into the slot"
                            />
                        </View>
                        <Text variant="footnote" script="mono" weight="medium" tone="muted">
                            {progress.label}
                        </Text>
                    </View>
                ) : null}

                <Button
                    label={inChair ? 'Finish visit' : 'Take payment'}
                    variant="inverse"
                    size="md"
                    block
                    icon={<CheckIcon size={17} stroke={color.ink} />}
                    style={styles.action}
                    onPress={() => onOpen(active)}
                />
            </View>
        );
    }

    if (next) {
        const until = minutesOfDay(next.startsAt) - nowMinutes;
        const { time, meridiem } = time12(next.startsAt);

        return (
            <View style={styles.card}>
                <View style={styles.eyebrowRow}>
                    <Dot tone="accent" size={7} />
                    <Text variant="eyebrow" tone="muted">
                        NEXT UP
                    </Text>
                    <StartedAt appointment={next} />
                </View>

                <Text variant="title" weight="semibold" tone="inverse" numberOfLines={1} style={styles.name}>
                    {next.patient.name}
                </Text>

                <View style={styles.detail}>
                    <ClockIcon />
                    <Text variant="callout" tone="muted" style={styles.detailText}>
                        {until > 0
                            ? `${time} ${meridiem} · in ${until} min`
                            : `${time} ${meridiem} · ${Math.abs(until)} min late`}
                    </Text>
                </View>

                <Button
                    label="Check in"
                    variant="inverse"
                    size="md"
                    block
                    icon={<CheckIcon size={17} stroke={color.ink} />}
                    style={styles.action}
                    loading={checkingInId === next.id}
                    onPress={() => onCheckIn(next)}
                />
            </View>
        );
    }

    return (
        <View style={[styles.card, styles.empty]}>
            <Text variant="eyebrow" tone="muted">
                THE CHAIR
            </Text>
            <Text variant="headline" weight="medium" tone="inverse">
                Nobody in the chair
            </Text>
            <Text variant="subhead" tone="muted">
                Nothing left to check in today.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: size.bleed,
        padding: space[5],
        backgroundColor: color.ink,
        borderRadius: radius.xl3,
    },
    empty: { gap: space[1], padding: space[5] },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    startedAt: { marginStart: 'auto' },
    name: { marginTop: space[3.5] },
    detail: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], marginTop: space[1.5] },
    detailText: { flex: 1 },
    progress: { flexDirection: 'row', alignItems: 'center', gap: space[2.5], marginTop: space[4] },
    track: { flex: 1 },
    action: { marginTop: space[4] },
});
