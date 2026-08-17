/**
 * What this patient is in for — the sheet the doctor gets when he taps a row on
 * his day. It replaces the secretary's appointment sheet, which was a column of
 * desk writes he must not press (check in, no-show, cancel) and never drew the
 * one thing he opens a row to see: `appointment.procedures`.
 *
 * So this sheet is a read. Its only action leaves it — "Open patient record" —
 * and the sheet exists because that record is the wrong first answer: standing
 * over the chair, the question is "what am I doing to this person", not "what
 * did we do in 2023". The plan is two taps closer than the history now, and the
 * history is still one tap away.
 *
 * Laid out from `appointment-view.html`'s identity block and group cards, with
 * one change the mock does not have to make: that page is a finished visit with
 * four procedures over three teeth, where a card per tooth is a dense list. A
 * booking is usually one line, and a bordered card with a header row, a divider
 * and a single name in it is mostly chrome. So the teeth share one card and are
 * hairline-separated rows inside it — the badge, the name, the position spelled
 * out because `UL6` and `UR6` are one letter apart and opposite sides of the
 * mouth.
 *
 * No money anywhere, unlike the mock. A booking carries no price by design (the
 * visit snapshots the catalogue on the day, §7), and pricing is the desk's.
 */
import { StyleSheet, View } from 'react-native';
import { Button, Sheet } from '../../../components/ui';
import { border, color, radius, space, Text } from '../../../theme';
import type { Appointment, AppointmentProcedure } from '../data';
import { toothGroupsOf, toothPosition } from '../procedures';
import { dateKey, formatTime, minutesOfDay, minutesToClock, relativeDayLabel } from '../time';
import { _LocalStatusPill } from './_LocalStatusPill';

export type DoctorVisitSheetProps = {
    visible: boolean;
    appointment: Appointment | null;
    onClose: () => void;
    /** The record for this patient — the sheet's one way out that is not "close". */
    onOpenRecord: (appointment: Appointment) => void;
};

export function DoctorVisitSheet({ visible, appointment, onClose, onOpenRecord }: DoctorVisitSheetProps) {
    const procedures = appointment?.procedures ?? [];
    const groups = toothGroupsOf(procedures);

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            testID="doctor-visit-sheet"
            footer={
                appointment ? (
                    <Button
                        label="Open patient record"
                        block
                        onPress={() => onOpenRecord(appointment)}
                        testID="open-record"
                    />
                ) : null
            }
        >
            {appointment ? (
                <>
                    <Identity appointment={appointment} />

                    <View style={styles.sectionHead}>
                        <Text variant="eyebrow" tone="muted">
                            IN FOR
                        </Text>
                        <Text variant="footnote" tone="muted">
                            {procedures.length === 1 ? '1 procedure' : `${procedures.length} procedures`}
                        </Text>
                    </View>

                    {groups.length === 0 ? (
                        // A real and common state: what is done is decided in the
                        // chair. Said in a sentence rather than left as an empty
                        // card, which reads as a failed load.
                        <View style={styles.blank}>
                            <Text variant="subhead" tone="muted">
                                Nothing planned — it will be decided in the chair.
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.plan}>
                            {groups.map((group, index) => (
                                <View
                                    key={group.tooth ?? 'none'}
                                    style={[styles.group, index > 0 && styles.groupDivided]}
                                >
                                    <View style={[styles.badge, !group.tooth && styles.badgeNone]}>
                                        <Text
                                            variant="footnote"
                                            weight="bold"
                                            tone={group.tooth ? 'ink' : 'muted'}
                                        >
                                            {group.tooth ?? '—'}
                                        </Text>
                                    </View>

                                    <View style={styles.groupBody}>
                                        {group.items.map((item) => (
                                            <PlanLine key={item.id} procedure={item} />
                                        ))}
                                        <Text variant="footnote" tone="muted">
                                            {toothPosition(group.tooth)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {appointment.note ? (
                        <View style={styles.note}>
                            <Text variant="eyebrow" tone="muted">
                                NOTE FROM THE DESK
                            </Text>
                            <Text variant="body" tone="ink2" style={styles.noteText}>
                                {appointment.note}
                            </Text>
                        </View>
                    ) : null}
                </>
            ) : null}
        </Sheet>
    );
}

/**
 * The mock's identity block, with the time on the dark tile where it puts the
 * date. A doctor opening this already knows what day it is; what he is placing
 * is the patient against the hour, so the tile carries the slot and the line
 * under the name carries the day — which only says something worth reading when
 * he is looking at a day that is not today.
 */
function Identity({ appointment }: { appointment: Appointment }) {
    return (
        <View style={styles.identity}>
            <View style={styles.tile}>
                <Text variant="headline" script="mono" weight="semibold" tone="inverse">
                    {formatTime(appointment.startsAt)}
                </Text>
                <Text variant="tag" tone="inverse" style={styles.tileSub}>
                    {`${appointment.durationMinutes} MIN`}
                </Text>
            </View>

            <View style={styles.who}>
                <Text variant="title2" weight="semibold" numberOfLines={2}>
                    {appointment.patient.name}
                </Text>
                <Text variant="subhead" tone="muted">
                    {slotLabel(appointment)}
                </Text>
                <View style={styles.status}>
                    <_LocalStatusPill status={appointment.status} withDot />
                </View>
            </View>
        </View>
    );
}

/**
 * The quantity rides on the name rather than in a column of its own: it is 1 on
 * nearly every line, and a column that is almost always "1" costs more width
 * than it explains.
 */
function PlanLine({ procedure }: { procedure: AppointmentProcedure }) {
    return (
        <View style={styles.line}>
            <Text variant="body" weight="semibold">
                {procedure.quantity > 1 ? `${procedure.name} × ${procedure.quantity}` : procedure.name}
            </Text>
            {procedure.note ? (
                <Text variant="caption" tone="muted">
                    {procedure.note}
                </Text>
            ) : null}
        </View>
    );
}

/** `Today · 11:35 – 12:35`. */
function slotLabel(appointment: Appointment): string {
    const start = new Date(appointment.startsAt);
    const end = minutesOfDay(appointment.startsAt) + appointment.durationMinutes;
    return `${relativeDayLabel(dateKey(start))} · ${formatTime(appointment.startsAt)} – ${minutesToClock(end)}`;
}

const styles = StyleSheet.create({
    identity: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3.5] },
    tile: {
        width: 64,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        borderRadius: radius.xl2,
        backgroundColor: color.ink,
    },
    // The mock's `rgba(255,255,255,.62)` — a second white on ink, which the
    // palette has no token for because nothing else sits on a dark ground.
    tileSub: { opacity: 0.62 },
    who: { flex: 1, gap: space[1] },
    status: { flexDirection: 'row', paddingTop: space[1] },

    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    blank: { paddingBottom: space[1] },

    // One card for every tooth rather than one each: a booking is usually a
    // single line, and a bordered box per line is more border than plan.
    plan: {
        borderRadius: radius.xl2,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
        overflow: 'hidden',
    },
    group: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
    },
    groupDivided: { borderTopWidth: border.hair, borderTopColor: color.hair },
    badge: {
        minWidth: 46,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[1.5],
        borderRadius: radius.sm,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface2,
    },
    badgeNone: { backgroundColor: color.surface, borderStyle: 'dashed' },
    groupBody: { flex: 1, gap: space[0.5], paddingTop: space[0.5] },
    line: { gap: space[0.5] },

    note: {
        gap: space[1.5],
    },
    noteText: {
        lineHeight: 21,
        padding: space[3],
        borderRadius: radius.lg,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.canvas,
    },
});
