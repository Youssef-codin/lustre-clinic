import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, EmptyState } from '../../../components/ui';
import { border, color, size, space, Text } from '../../../theme';
import { api, type PendingReminder, type QueryResult } from '../data';
import { describeError } from '../errors';
import { dateKey, relativeDayLabel, time12 } from '../time';
import { DaySkeleton } from './DayStates';
import { CloseIcon } from './icons';

/**
 * The reminders tab of `day-view-schedule.html` — SPEC §11.
 *
 * Nothing here sends anything. WhatsApp Business is the channel and it cannot be
 * driven from another app, so the button opens a prefilled chat and the row then
 * asks what happened. That is why "Sent" is a claim the user makes rather than a
 * fact the app observes, and why skipping is a first-class action next to it: a
 * patient who was reached by phone still owes no message.
 *
 * The rows are marked one at a time and optimistically. A list that only settled
 * after the server answered would sit under the finger for as long as Tailscale
 * takes, across a dozen taps in a row; a failure puts the row back and says so.
 */

export type RemindersProps = {
    query: QueryResult<PendingReminder[]>;
};

export function Reminders({ query }: RemindersProps) {
    // What this session has already dealt with. The server is the record; this
    // is what keeps the list moving while it catches up.
    const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
    const [failed, setFailed] = useState<string | null>(null);

    const pending = (query.data ?? []).filter((row) => !settled.has(row.id));

    function forget(id: string) {
        setSettled((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
        });
    }

    /**
     * Marked here rather than through `useLocalMutation`: that hook holds one
     * in-flight write and one error for the whole component, and this list marks
     * rows independently and often several before the first answer lands.
     */
    async function settle(reminder: PendingReminder, how: 'sent' | 'skipped') {
        setSettled((current) => new Set(current).add(reminder.id));
        setFailed(null);

        try {
            if (how === 'sent') {
                await api.markReminderSent(reminder.id);
            } else {
                await api.markReminderSkipped(reminder.id);
            }
        } catch {
            // A row that failed to settle comes back. The alternative is a
            // patient silently dropped off a list whose whole job is that
            // nobody is.
            forget(reminder.id);
            setFailed(reminder.patient.name);
        }
    }

    async function open(reminder: PendingReminder) {
        // Marked sent on the way out, not on the way back: nothing tells us
        // whether the message was actually typed, and a row left pending after
        // WhatsApp opened gets sent twice by the next person down the list.
        await Linking.openURL(reminder.whatsAppUrl).then(
            () => settle(reminder, 'sent'),
            () => setFailed(reminder.patient.name),
        );
    }

    function skipAll() {
        for (const reminder of pending) void settle(reminder, 'skipped');
    }

    if (query.status === 'loading') return <DaySkeleton />;

    if (query.status === 'error' && query.error && pending.length === 0) {
        const described = describeError(query.error);
        return (
            <EmptyState
                title={described.title}
                body={described.body}
                actionLabel="Try again"
                onAction={query.refetch}
            />
        );
    }

    if (pending.length === 0) {
        return <EmptyState title="Everyone has been messaged" body="No reminder is waiting to go out." />;
    }

    return (
        <View style={styles.pane}>
            {failed ? (
                <Banner tone="warning" message={`${failed}'s reminder could not be marked — try again.`} />
            ) : null}

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
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
                    />
                ))}

                <View style={styles.footer}>
                    <Button
                        label="Skip all"
                        variant="secondary"
                        size="md"
                        style={styles.half}
                        onPress={skipAll}
                    />
                    <Button
                        label="Send remaining"
                        variant="whatsapp"
                        size="md"
                        style={styles.half}
                        onPress={() => {
                            const first = pending[0];
                            if (first) void open(first);
                        }}
                    />
                </View>
            </ScrollView>
        </View>
    );
}

function ReminderRow({
    reminder,
    onSend,
    onSkip,
}: {
    reminder: PendingReminder;
    onSend: () => void;
    onSkip: () => void;
}) {
    const { time, meridiem } = time12(reminder.startsAt);
    // Which day, because a reminder list is not one day's: a row falls due a
    // lead time before its appointment, so tomorrow's and Thursday's sit
    // together and the time alone would not say which is which.
    const day = relativeDayLabel(dateKey(new Date(reminder.startsAt)));

    return (
        <View style={styles.row}>
            <View style={styles.body}>
                <Text variant="headline" weight="semibold" numberOfLines={1}>
                    {reminder.patient.name}
                </Text>
                <Text variant="subhead" tone="muted" numberOfLines={1}>
                    {`${day} · ${time} ${meridiem}`}
                </Text>
            </View>

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
    skip: { padding: space[1] },
    pressed: { opacity: 0.5 },
    send: { paddingHorizontal: space[3.5] },
    footer: { flexDirection: 'row', gap: space[2.5], marginTop: space[5] },
    half: { flex: 1 },
});
