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
import { Banner, Button, EmptyState } from '../../../components/ui';
import { border, color, size, space, Text } from '../../../theme';
import { api, type PendingReminder, type QueryResult } from '../data';
import { describeError } from '../errors';
import { dateKey, relativeDayLabel, time12 } from '../time';
import { DaySkeleton } from './DayStates';
import { CloseIcon } from './icons';

export type RemindersProps = {
    query: QueryResult<PendingReminder[]>;
};

export function Reminders({ query }: RemindersProps) {
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
