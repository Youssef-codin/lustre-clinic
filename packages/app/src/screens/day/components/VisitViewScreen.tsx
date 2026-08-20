/**
 * A visit that is over — `appointment-view.html`. The same cards as
 * `VisitScreen` with the inputs taken out: what was done, and what was paid for
 * it, split by the segmented control because they are two questions and a
 * finished visit is usually opened for one of them.
 *
 * Read-only is the resting state, not the only one. `Edit visit` hands the
 * visit to `VisitScreen` and writes nothing: the reopen the server needs before
 * `setProcedures` will take on a completed visit happens on that screen's
 * Confirm, with the edit itself. Opening the editor and backing out of it left
 * a closed visit standing open here — the same mistake as checking a patient in
 * the moment their arrival screen was opened.
 *
 * The mock's clinical and billing notes are left out for the same reason as on
 * `VisitScreen`: `visits` has no column to hold either.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chevron, SegmentedControl } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { Appointment, Visit, VisitPayment } from '../data';
import { formatAmount, formatMoney } from '../money';
import { toothGroupsOf, toothPosition } from '../procedures';
import { dateKey, formatLongDate, formatTime } from '../time';
import { VisitStatusChip } from './VisitStatusChip';

export type VisitViewScreenProps = {
    appointment: Appointment;
    visit: Visit;
    onBack: () => void;
    /** Open the editor over this page. Nothing has been written to the visit. */
    onEdit: (visit: Visit) => void;
};

type Panel = 'treatment' | 'payment';

const METHOD_LABEL: Record<string, string> = {
    cash: 'Cash',
    visa: 'Card',
    instapay: 'Instapay',
    other: 'Other',
};

function methodLabel(payment: VisitPayment): string {
    if (payment.method === 'other') return payment.methodNote?.trim() || 'Other';
    return METHOD_LABEL[payment.method] ?? payment.method;
}

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function monthOf(iso: string): string {
    return MONTHS_SHORT[new Date(iso).getMonth()] ?? '';
}

export function VisitViewScreen({ appointment, visit, onBack, onEdit }: VisitViewScreenProps) {
    const [panel, setPanel] = useState<Panel>('treatment');

    const groups = toothGroupsOf(visit.procedures);
    const settled = visit.balance <= 0;
    const day = dateKey(new Date(appointment.startsAt));

    return (
        <View style={styles.screen} testID="visit-view-screen">
            <View style={styles.topbar}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    onPress={onBack}
                    style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
                >
                    <Chevron direction="back" size={10} tone="ink" />
                </Pressable>
                <Text variant="eyebrow" tone="muted" style={styles.grow}>
                    VISIT
                </Text>
            </View>

            <View style={styles.identity}>
                <View style={styles.tile}>
                    <Text variant="title3" script="sans" weight="semibold" tone="inverse">
                        {new Date(appointment.startsAt).getDate()}
                    </Text>
                    <Text variant="tag" tone="inverse" style={styles.tileMonth}>
                        {monthOf(appointment.startsAt)}
                    </Text>
                </View>

                <View style={styles.who}>
                    <Text variant="title2" weight="bold" numberOfLines={2}>
                        {appointment.patient.name}
                    </Text>
                    <Text variant="subhead" tone="muted">
                        {`${formatLongDate(day)} · ${formatTime(appointment.startsAt)}`}
                    </Text>
                    <View style={styles.chipRow}>
                        <VisitStatusChip state={visit.completedAt ? 'finished' : 'unpaid'} />
                    </View>
                </View>
            </View>

            <View style={styles.strip}>
                <View style={[styles.stripDot, settled ? styles.dotSettled : styles.dotDue]} />
                <Text variant="subhead" tone="muted">
                    {settled ? 'Paid in full' : 'Remaining balance'}
                </Text>
                <Text
                    variant="headline"
                    script="mono"
                    weight="bold"
                    tone={settled ? 'success' : 'due'}
                    style={styles.stripAmount}
                >
                    {formatMoney(settled ? visit.chargedTotal : visit.balance)}
                </Text>
            </View>

            <View style={styles.tabs}>
                <SegmentedControl<Panel>
                    accessibilityLabel="Treatment or payment"
                    value={panel}
                    onChange={setPanel}
                    segments={[
                        { value: 'treatment', label: 'Treatment' },
                        { value: 'payment', label: `Payment · ${visit.payments.length}` },
                    ]}
                />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.body}
                showsVerticalScrollIndicator={false}
            >
                {panel === 'treatment' ? (
                    <>
                        <View style={styles.sectionHead}>
                            <Text variant="eyebrow" tone="muted">
                                WHAT WAS DONE
                            </Text>
                            <Text variant="footnote" tone="muted">
                                {visit.procedures.length === 1
                                    ? '1 procedure'
                                    : `${visit.procedures.length} procedures`}
                            </Text>
                        </View>

                        {groups.length === 0 ? (
                            <View style={styles.blank}>
                                <Text variant="subhead" tone="muted">
                                    Nothing was recorded on this visit.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.groups}>
                                {groups.map((group) => (
                                    <View key={group.tooth ?? 'none'} style={styles.group}>
                                        <View style={styles.groupHead}>
                                            <View style={[styles.badge, !group.tooth && styles.badgeNone]}>
                                                <Text
                                                    variant="subhead"
                                                    weight="bold"
                                                    tone={group.tooth ? 'inverse' : 'muted'}
                                                >
                                                    {group.tooth ?? '—'}
                                                </Text>
                                            </View>

                                            <Text
                                                variant="subhead"
                                                weight="medium"
                                                tone="muted"
                                                numberOfLines={1}
                                                style={styles.grow}
                                            >
                                                {toothPosition(group.tooth)}
                                            </Text>

                                            <Text variant="callout" script="mono" weight="bold">
                                                {formatAmount(
                                                    group.items.reduce(
                                                        (sum, line) => sum + line.lineTotal,
                                                        0,
                                                    ),
                                                )}
                                            </Text>
                                        </View>

                                        <View>
                                            {group.items.map((line) => (
                                                <View key={line.id} style={styles.line}>
                                                    <Text
                                                        variant="callout"
                                                        weight="semibold"
                                                        style={styles.grow}
                                                    >
                                                        {line.quantity > 1
                                                            ? `${line.name} × ${line.quantity}`
                                                            : line.name}
                                                    </Text>
                                                    <Text variant="eyebrow" tone="muted">
                                                        EGP
                                                    </Text>
                                                    <Text variant="body" script="mono" weight="bold">
                                                        {formatAmount(line.lineTotal)}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={styles.total}>
                            <Text variant="subhead" tone="muted">
                                Total cost
                            </Text>
                            <Text variant="headline" script="mono" weight="bold">
                                {formatMoney(visit.chargedTotal)}
                            </Text>
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.sectionHead}>
                            <Text variant="eyebrow" tone="muted">
                                PAYMENTS RECEIVED
                            </Text>
                            <Text variant="footnote" tone="muted">
                                {`${formatMoney(visit.paidTotal)} of ${formatAmount(visit.chargedTotal)}`}
                            </Text>
                        </View>

                        {visit.payments.length === 0 ? (
                            <View style={styles.blank}>
                                <Text variant="subhead" tone="muted">
                                    Nothing has been paid on this visit yet.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.payments}>
                                {visit.payments.map((payment, index) => (
                                    <View
                                        key={payment.id}
                                        style={[styles.dateRow, index > 0 && styles.dateRowDivided]}
                                    >
                                        <View style={styles.stamp}>
                                            <Text variant="callout" script="mono" weight="bold">
                                                {new Date(payment.paidAt).getDate()}
                                            </Text>
                                            <Text variant="tag" tone="muted">
                                                {monthOf(payment.paidAt)}
                                            </Text>
                                        </View>

                                        <Text
                                            variant="subhead"
                                            weight="semibold"
                                            tone="ink2"
                                            numberOfLines={1}
                                            style={styles.grow}
                                        >
                                            {methodLabel(payment)}
                                        </Text>

                                        <Text variant="eyebrow" tone="muted">
                                            EGP
                                        </Text>
                                        <Text variant="body" script="mono" weight="bold">
                                            {formatAmount(payment.amount)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={styles.total}>
                            <Text variant="subhead" tone="muted">
                                Remaining balance
                            </Text>
                            <Text
                                variant="headline"
                                script="mono"
                                weight="bold"
                                tone={settled ? 'ink' : 'due'}
                            >
                                {formatMoney(Math.max(visit.balance, 0))}
                            </Text>
                        </View>
                    </>
                )}
            </ScrollView>

            <View style={styles.bar}>
                <Button label="Edit visit" block onPress={() => onEdit(visit)} testID="visit-view-edit" />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.canvas },

    topbar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        paddingHorizontal: space[4],
        paddingTop: space[1.5],
        paddingBottom: space[0.5],
    },
    back: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    backPressed: { backgroundColor: color.surface2 },

    identity: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3.5],
        paddingHorizontal: size.gutter,
        paddingTop: space[3.5],
        paddingBottom: space[4.5],
    },
    tile: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.xl2,
        backgroundColor: color.ink,
    },
    tileMonth: { opacity: 0.62 },
    who: { flex: 1, minWidth: 0, gap: space[1], alignItems: 'flex-start' },
    // The chip sizes itself; the row is only what holds it off the line above.
    chipRow: { flexDirection: 'row', marginTop: space[1] },

    strip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        marginHorizontal: size.gutter,
        paddingVertical: space[3],
        borderTopWidth: border.hair,
        borderTopColor: color.hair,
        borderBottomWidth: border.hair,
        borderBottomColor: color.hair,
    },
    stripDot: { width: 7, height: 7, borderRadius: radius.full },
    dotSettled: { backgroundColor: color.success },
    dotDue: { backgroundColor: color.due },
    stripAmount: { marginStart: 'auto' },

    tabs: { paddingHorizontal: size.gutter, paddingTop: space[4], paddingBottom: space[1] },

    scroll: { flex: 1 },
    body: { paddingBottom: space[8] },

    sectionHead: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: size.gutter,
        paddingTop: space[4],
        paddingBottom: space[2.5],
    },
    blank: { paddingHorizontal: size.gutter, paddingBottom: space[2] },
    grow: { flex: 1, minWidth: 0 },

    groups: { gap: space[3], paddingHorizontal: size.gutter, paddingTop: space[0.5] },
    group: {
        borderRadius: radius.xl2,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
        overflow: 'hidden',
    },
    groupHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        minHeight: 54,
        paddingStart: space[2.5],
        paddingEnd: space[3.5],
    },
    badge: {
        minWidth: 46,
        height: 37,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[1.5],
        borderRadius: radius.md,
        backgroundColor: color.ink,
    },
    badgeNone: {
        backgroundColor: color.surface2,
        borderWidth: border.hair,
        borderStyle: 'dashed',
        borderColor: color.line,
    },
    line: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
        borderTopWidth: border.hair,
        borderTopColor: color.hair,
    },

    payments: { paddingHorizontal: size.gutter },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
    },
    dateRowDivided: { borderTopWidth: border.hair, borderTopColor: color.hair },
    stamp: { width: 46, alignItems: 'center', justifyContent: 'center', gap: 1 },

    total: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: size.gutter,
        marginTop: space[3.5],
        paddingVertical: space[3.5],
        paddingHorizontal: space[4],
        borderRadius: radius.xl,
        backgroundColor: color.surface2,
    },

    notice: { paddingHorizontal: size.gutter, paddingBottom: space[2] },
    bar: {
        paddingHorizontal: size.gutter,
        paddingTop: space[3.5],
        // The tab bar is below this again and owns the gesture inset, so the
        // bar only needs its own breathing room — `space[6]` left the button
        // floating well clear of the tabs.
        paddingBottom: space[4],
        backgroundColor: color.canvas,
    },
});
