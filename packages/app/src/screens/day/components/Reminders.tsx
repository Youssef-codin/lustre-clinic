/**
 * The reminders tab of `day-view-schedule.html` — SPEC §11. Nothing here sends
 * anything: WhatsApp Business cannot be driven from another app, so the button
 * opens a prefilled chat and the row then asks what happened. "Sent" is a claim
 * the user makes rather than a fact the app observes, and skipping is a
 * first-class action next to it. Rows are marked one at a time, optimistically,
 * and outside `useLocalMutation` (which holds one in-flight write and one error
 * for the whole component) — a failure puts the row back and says so. Rows are
 * marked sent on the way out, not the way back: nothing tells whether the
 * message was actually typed, and a row left pending gets sent twice by the
 * next person. The list spans days — a reminder falls due a lead time before
 * its appointment — so each row names its day.
 */
import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, EmptyState, type RefreshControlElement, RefreshView } from '../../../components/ui';
import { useRearmReminderNudges } from '../../../notifications';
import { border, color, size, space, Text } from '../../../theme';
import { api, type PendingReminder, type QueryResult } from '../data';
import { describeError } from '../errors';
import { dateKey, relativeDayLabel, time12, todayKey } from '../time';
import { DaySkeleton } from './DayStates';
import { CloseIcon } from './icons';

export type RemindersProps = {
    query: QueryResult<PendingReminder[]>;
    /** The day screen's pull-to-refresh, shared so the tab re-reads with it. */
    refreshControl?: RefreshControlElement;
    /**
     * Open the patient behind a row. The reminder carries the patient embedded,
     * so the id is already here and the name is a way into the record — which is
     * what the name is for: "who is this" is the question a reminder raises.
     */
    onOpenRecord?: (patientId: string) => void;
};

export function Reminders({ query, refreshControl, onOpenRecord }: RemindersProps) {
    const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
    const [failed, setFailed] = useState<string | null>(null);
    const [quietToday, setQuietToday] = useState(false);

    // Every action here moves what the daily nudge should be armed against, and
    // they all go over the raw tRPC client, which leaves the query cache alone.
    const rearm = useRearmReminderNudges();

    const pending = (query.data ?? []).filter((row) => !settled.has(row.id));

    function forget(id: string) {
        setSettled((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
        });
    }

    async function settle(reminder: PendingReminder, how: 'sent' | 'skipped') {
        setSettled((current) => new Set(current).add(reminder.id));
        setFailed(null);

        try {
            if (how === 'sent') {
                await api.markReminderSent(reminder.id);
            } else {
                await api.markReminderSkipped(reminder.id);
            }
            rearm();
        } catch {
            forget(reminder.id);
            setFailed(reminder.patient.name);
        }
    }

    async function open(reminder: PendingReminder) {
        await Linking.openURL(reminder.whatsAppUrl).then(
            () => settle(reminder, 'sent'),
            () => setFailed(reminder.patient.name),
        );
    }

    function skipAll() {
        for (const reminder of pending) void settle(reminder, 'skipped');
    }

    /**
     * Stop today's notification without touching the list. The reminders stay
     * pending and still have to go out — this is the desk saying it has been
     * told enough for one day, which is the stop condition the repeat setting
     * promises and the only thing `reminder_dismissed_on` was ever for.
     */
    async function dismissToday() {
        setQuietToday(true);
        await api.dismissRemindersToday(todayKey()).then(rearm, () => setQuietToday(false));
    }

    if (query.status === 'loading') return <DaySkeleton />;

    if (query.status === 'error' && query.error && pending.length === 0) {
        const described = describeError(query.error);
        return (
            <RefreshView refreshControl={refreshControl}>
                <EmptyState
                    title={described.title}
                    body={described.body}
                    actionLabel="Try again"
                    onAction={query.refetch}
                />
            </RefreshView>
        );
    }

    if (pending.length === 0) {
        return (
            <RefreshView refreshControl={refreshControl}>
                <EmptyState title="Everyone has been messaged" body="No reminder is waiting to go out." />
            </RefreshView>
        );
    }

    return (
        <View style={styles.pane}>
            {failed ? (
                <Banner tone="warning" message={`${failed}'s reminder could not be marked — try again.`} />
            ) : null}

            <ScrollView
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                refreshControl={refreshControl}
            >
                <Text variant="body" tone="ink2" style={styles.lede}>
                    {pending.length === 1
                        ? "1 patient hasn't been messaged yet."
                        : `${pending.length} patients haven't been messaged yet.`}
                </Text>

                {pending.map((reminder) => (
                    <ReminderRow
                        key={reminder.id}
                        reminder={reminder}
                        onSend={() => void open(reminder)}
                        onSkip={() => void settle(reminder, 'skipped')}
                        onOpenRecord={onOpenRecord && (() => onOpenRecord(reminder.patient.id))}
                    />
                ))}

                {/* Skip all is the only bulk action there is. "Send remaining"
                    sat beside it and only opened the first row's chat, which
                    the row's own button already does — a bulk action it was
                    not. One button, so it sits at its own width rather than
                    stretched across a half it no longer shares. */}
                <View style={styles.footer}>
                    <Button label="Skip all" variant="secondary" size="md" onPress={skipAll} />
                    {/* Not a second Skip all. This one leaves every reminder
                        pending and only quiets today's notification — the two
                        sit together because this is where the desk is when it
                        decides it has had enough nudging. */}
                    <Button
                        label={quietToday ? 'Quiet until tomorrow' : 'Not today'}
                        variant="ghost"
                        size="md"
                        disabled={quietToday}
                        onPress={() => void dismissToday()}
                    />
                </View>
            </ScrollView>
        </View>
    );
}

/**
 * The row reads as the patient, not as a strip of anonymous buttons. Opening
 * the record is the patient half's own press, so the name and the time are one
 * target carrying one label — "Sara Elmasry, Fri 21 Aug · 12:00 PM" — and Send
 * and Skip carry theirs. Three nodes, each of which says what it is and whose
 * it is, rather than a bare name followed by an unlabelled ✕.
 *
 * It is deliberately not one node with the other two as custom actions, which
 * is the obvious shape and does not survive Android: `accessible` on the
 * wrapper groups the subtree on iOS only, a `Pressable` puts itself back in the
 * tree underneath it (`accessible={false}` and `no-hide-descendants` both lose
 * that argument — checked with `uiautomator dump`, not assumed), and
 * `ui/Button` takes a closed prop list this cluster cannot widen. A grouping
 * the platform ignores is worse than none: it reads as a duplicate of the row
 * it wraps. The actions stay on the patient node instead, where TalkBack's
 * context menu reaches them, so nothing is only-reachable by hunting.
 *
 * `hitSlop` aside, the touch targets are unchanged, and the patient half is a
 * sibling of the controls rather than a parent, so it cannot swallow a press.
 */
function ReminderRow({
    reminder,
    onSend,
    onSkip,
    onOpenRecord,
}: {
    reminder: PendingReminder;
    onSend: () => void;
    onSkip: () => void;
    onOpenRecord?: (() => void) | undefined;
}) {
    const { time, meridiem } = time12(reminder.startsAt);
    const day = relativeDayLabel(dateKey(new Date(reminder.startsAt)));
    const when = `${day} · ${time} ${meridiem}`;

    const who = (
        <>
            <Text variant="headline" weight="semibold" numberOfLines={1}>
                {reminder.patient.name}
            </Text>
            <Text variant="subhead" tone="muted" numberOfLines={1}>
                {when}
            </Text>
        </>
    );

    return (
        <View style={styles.row}>
            {onOpenRecord ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${reminder.patient.name}, ${when}`}
                    accessibilityHint="Opens the patient's record"
                    accessibilityActions={[
                        { name: 'send', label: 'Send the reminder on WhatsApp' },
                        { name: 'skip', label: 'Skip this reminder' },
                    ]}
                    onAccessibilityAction={(event) => {
                        if (event.nativeEvent.actionName === 'send') onSend();
                        else onSkip();
                    }}
                    onPress={onOpenRecord}
                    hitSlop={space[1]}
                    style={({ pressed }) => [styles.body, pressed && styles.pressed]}
                >
                    {who}
                </Pressable>
            ) : (
                <View style={styles.body}>{who}</View>
            )}

            <View style={styles.controls}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Skip ${reminder.patient.name}'s reminder`}
                    onPress={onSkip}
                    hitSlop={space[2]}
                    style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
                >
                    <CloseIcon size={16} />
                </Pressable>

                <Button
                    label="WhatsApp"
                    variant="whatsapp"
                    size="md"
                    icon={<FontAwesome name="whatsapp" size={15} color={color.inverse} />}
                    style={styles.send}
                    onPress={onSend}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    pane: { flex: 1 },
    list: { paddingHorizontal: size.gutter, paddingBottom: size.nav },
    lede: { marginBottom: space[3.5] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3.5],
        minHeight: size.row,
        borderBottomWidth: border.hair,
        borderBottomColor: color.line,
    },
    body: { flex: 1, gap: space[0.5] },
    /** Skip and Send, grouped so one prop hides both from the screen reader. */
    controls: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    skip: { padding: space[1] },
    pressed: { opacity: 0.5 },
    send: { paddingHorizontal: space[3.5] },
    // No `alignItems` here: `ui/Button` carries `alignSelf: 'flex-start'`, which
    // wins, and the gutter is where the list's left edge already is.
    // Two buttons at their own widths rather than stretched across a half
    // each: they are not a pair of equals — one ends the messages, the other
    // only quiets tonight's nudge — and equal halves read as a choice between
    // two versions of the same thing.
    footer: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[5] },
});
