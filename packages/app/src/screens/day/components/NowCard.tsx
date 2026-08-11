/**
 * The chair, at the top of the screen — the black card from
 * `day-view-schedule.html`. The list answers "what does today look like"; this
 * answers "what is happening right now", and it has three states because the
 * clinic has three: someone in the chair or at the desk, someone due next, and
 * nobody. The `ProgressBar` must sit in its own container: it sizes itself
 * with `alignSelf`, which inside a row means nothing at all.
 */
import { StyleSheet, View } from 'react-native';
import { Button, Dot, ProgressBar } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import { slotProgress } from '../chair';
import type { Appointment } from '../data';
import { minutesOfDay, time12 } from '../time';
import { CheckIcon, ClockIcon } from './icons';

export type NowCardProps = {
    active: Appointment | null;
    next: Appointment | null;
    nowMinutes: number;
    procedure?: string;
    onCheckIn: (appointment: Appointment) => void;
    onOpen: (appointment: Appointment) => void;
    checkingInId: string | null;
};

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
                        {active.note ?? procedure ?? progress.window}
                    </Text>
                </View>

                {inChair ? (
                    <View style={styles.progress}>
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
