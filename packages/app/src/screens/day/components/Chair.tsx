/**
 * The doctor's two headline pieces from `doctor-day-view.html`: the strip and
 * the black card. The strip is whoever is in the chair, reduced to a name and
 * one button; the card is what comes after. With nothing after, the chair
 * takes the card back and gets its progress bar and Finish button there. The
 * waited counter is the one number measured against the patient rather than
 * the slot, and is allowed to be: `checked_in_at` is exactly when the wait
 * started.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Dot, ProgressBar } from '../../../components/ui';
import { border, color, radius, shadow, size, space, Text } from '../../../theme';
import { slotProgress } from '../chair';
import type { Appointment } from '../data';
import { minutesOfDay, time12 } from '../time';
import { CheckIcon, ClockIcon, ProcedureIcon } from './icons';

export type ChairStripProps = {
    appointment: Appointment;
    nowMinutes: number;
    procedure?: string;
    finishing: boolean;
    onOpen: (appointment: Appointment) => void;
    onOpenRecord: (patientId: string) => void;
    onFinish: (appointment: Appointment) => void;
};

export function ChairStrip({
    appointment,
    nowMinutes,
    procedure,
    finishing,
    onOpen,
    onOpenRecord,
    onFinish,
}: ChairStripProps) {
    const progress = slotProgress(appointment, nowMinutes);

    return (
        <View style={styles.strip} testID="chair-strip">
            <Dot tone="wa" size={7} pulse />

            <View style={styles.stripBody}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${appointment.patient.name}'s record`}
                    onPress={() => onOpenRecord(appointment.patient.id)}
                    style={({ pressed }) => [styles.stripName, pressed && styles.namePressed]}
                >
                    <Text variant="callout" weight="semibold" numberOfLines={1}>
                        {appointment.patient.name}
                    </Text>
                </Pressable>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`In the chair: ${appointment.patient.name}`}
                    onPress={() => onOpen(appointment)}
                >
                    <Text variant="footnote" tone="muted" numberOfLines={1}>
                        {procedure ? `${procedure} · ${progress.label}` : progress.label}
                    </Text>
                </Pressable>
            </View>

            <Button
                label="Finish"
                size="md"
                loading={finishing}
                icon={<CheckIcon size={13} stroke={color.inverse} />}
                style={styles.finish}
                onPress={() => onFinish(appointment)}
            />
        </View>
    );
}

export type ChairCardKind = 'chair' | 'waiting' | 'next';

export type ChairCardProps = {
    appointment: Appointment | null;
    kind: ChairCardKind;
    nowMinutes: number;
    procedure?: string;
    checkedInAt?: string;
    finishing: boolean;
    onOpen: (appointment: Appointment) => void;
    onOpenRecord: (patientId: string) => void;
    onFinish: (appointment: Appointment) => void;
};

export function ChairCard({
    appointment,
    kind,
    nowMinutes,
    procedure,
    checkedInAt,
    finishing,
    onOpen,
    onOpenRecord,
    onFinish,
}: ChairCardProps) {
    if (!appointment) {
        return (
            <View style={[styles.card, styles.empty]} testID="chair-card">
                <Text variant="eyebrow" tone="muted">
                    THE CHAIR
                </Text>
                <Text variant="headline" weight="medium" tone="inverse">
                    Nobody waiting
                </Text>
                <Text variant="subhead" tone="muted">
                    The day is done. Anyone new comes through the desk.
                </Text>
            </View>
        );
    }

    const eyebrow = EYEBROW[kind];
    const slot = time12(appointment.startsAt);
    const progress = slotProgress(appointment, nowMinutes);

    return (
        <View style={styles.card} testID="chair-card">
            <View style={styles.eyebrowRow}>
                <Dot tone={eyebrow.dot} size={7} pulse={eyebrow.pulse} />
                <Text variant="eyebrow" tone={eyebrow.tone}>
                    {eyebrow.label}
                </Text>
                <Text variant="eyebrow" tone="muted" style={styles.eyebrowEnd}>
                    {`${slot.time} ${slot.meridiem}`}
                </Text>
            </View>

            {/* The name goes to the person, the line under it to the visit —
                the same split the secretary's card makes. */}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${appointment.patient.name}'s record`}
                onPress={() => onOpenRecord(appointment.patient.id)}
                style={({ pressed }) => [styles.name, pressed && styles.namePressed]}
            >
                <Text variant="title" weight="semibold" tone="inverse" numberOfLines={1}>
                    {appointment.patient.name}
                </Text>
            </Pressable>

            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${eyebrow.label.toLowerCase()}: ${appointment.patient.name}`}
                onPress={() => onOpen(appointment)}
            >
                <View style={styles.detail}>
                    <ProcedureIcon />
                    <Text variant="callout" tone="muted" numberOfLines={1} style={styles.detailText}>
                        {appointment.note ?? procedure ?? progress.window}
                    </Text>
                </View>
            </Pressable>

            {kind === 'chair' ? (
                <>
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

                    <Button
                        label="Finish visit"
                        variant="inverse"
                        size="md"
                        block
                        loading={finishing}
                        icon={<CheckIcon size={17} stroke={color.ink} />}
                        style={styles.action}
                        onPress={() => onFinish(appointment)}
                    />
                </>
            ) : null}

            {kind === 'waiting' ? <Waited checkedInAt={checkedInAt} nowMinutes={nowMinutes} /> : null}

            {kind === 'next' ? (
                <View style={styles.footer}>
                    <Text variant="title2" weight="semibold" tone="inverse" style={styles.until}>
                        {untilLabel(minutesOfDay(appointment.startsAt) - nowMinutes)}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

function Waited({ checkedInAt, nowMinutes }: { checkedInAt?: string; nowMinutes: number }) {
    if (!checkedInAt) return null;

    const since = time12(checkedInAt);
    const waited = Math.max(0, nowMinutes - minutesOfDay(checkedInAt));

    return (
        <View style={styles.footer}>
            <Text variant="footnote" script="mono" weight="medium" tone="muted">
                {`checked in ${since.time} ${since.meridiem}`}
            </Text>
            <View style={styles.waited}>
                <ClockIcon size={14} stroke={color.due} width={2.2} />
                <Text variant="subhead" weight="semibold" tone="due">
                    {`waiting ${waited} min`}
                </Text>
            </View>
        </View>
    );
}

function untilLabel(until: number): string {
    if (until <= 0) return `${Math.abs(until)} min late`;
    if (until < 60) return `in ${until} min`;
    return `in ${Math.floor(until / 60)}h ${until % 60}m`;
}

const EYEBROW = {
    chair: { label: 'IN THE CHAIR', tone: 'live', dot: 'live', pulse: true },
    waiting: { label: 'WAITING', tone: 'due', dot: 'due', pulse: true },
    next: { label: 'NEXT UP', tone: 'muted', dot: 'accent', pulse: false },
} as const satisfies Record<
    ChairCardKind,
    { label: string; tone: 'live' | 'due' | 'muted'; dot: 'live' | 'due' | 'accent'; pulse: boolean }
>;

const styles = StyleSheet.create({
    strip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        marginHorizontal: size.bleed,
        marginBottom: space[2.5],
        paddingVertical: space[2.5],
        paddingStart: space[3.5],
        paddingEnd: space[2.5],
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        borderWidth: border.hair,
        borderColor: color.line,
        boxShadow: shadow.pill,
    },
    stripBody: { flex: 1, gap: space[0.5] },
    finish: { borderRadius: radius.full, paddingHorizontal: space[3.5] },

    card: {
        marginHorizontal: size.bleed,
        padding: space[5],
        backgroundColor: color.ink,
        borderRadius: radius.xl3,
    },
    empty: { gap: space[1] },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    eyebrowEnd: { marginStart: 'auto' },
    // `flex-start` so the target is the name's own width. Stretched across the
    // card, the gap beside a short name would open the record.
    name: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: space[3.5] },
    stripName: { alignSelf: 'flex-start', maxWidth: '100%' },
    namePressed: { opacity: 0.6 },
    detail: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], marginTop: space[1.5] },
    detailText: { flex: 1 },
    progress: { flexDirection: 'row', alignItems: 'center', gap: space[2.5], marginTop: space[4] },
    track: { flex: 1 },
    action: { marginTop: space[4] },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        marginTop: space[4],
        paddingTop: space[3.5],
        borderTopWidth: border.hair,
        borderTopColor: 'rgba(255,255,255,0.12)',
    },
    waited: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], marginStart: 'auto' },
    until: { marginStart: 'auto' },
});
