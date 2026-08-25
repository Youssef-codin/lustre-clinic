/**
 * Settings → Appointments: the list of durations the booking screen offers, and
 * which one it pre-fills.
 *
 * The default is not a separate setting with its own control — it is one of the
 * rows, chosen by tapping its circle, which is why the card reads as a radio
 * group rather than a list with a picker under it. The consequence is the rule
 * the pane has to state and the API has to enforce: the default row has no
 * remove control, because deleting it would leave the booking screen pre-filling
 * a duration that is no longer offered. Pick another default first.
 */
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from '@lustre/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTRPC } from '../../api';
import {
    Button,
    Callout,
    Card,
    CardDivider,
    Chip,
    NumericField,
    Radio,
    SectionLabel,
    Tag,
    usePullToRefresh,
} from '../../components/ui';
import { color, radius, size, space, Text } from '../../theme';
import { CloseIcon, PlusIcon } from './components/icons';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { errorText } from './data/errors';

/** The three the mockup offers as one-tap fills, minus whatever is already on. */
const QUICK_ADDS = [10, 25, 90] as const;

export function AppointmentsScreen({ onBack }: { onBack: () => void }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const settings = useQuery(trpc.settings.get.queryOptions());
    const [draft, setDraft] = useState('');

    // Every control on this pane writes the same row, so they are one mutation:
    // the list of durations and which of them is the default are two columns of
    // `settings`, not three procedures.
    const save = useMutation(
        trpc.settings.update.mutationOptions({
            onSuccess: () => queryClient.invalidateQueries(trpc.settings.pathFilter()),
        }),
    );

    const refreshControl = usePullToRefresh(settings.refetch, settings.isFetching);

    const data = settings.data;
    const durations = data?.durationOptions ?? [];
    const busy = save.isPending;

    const drafted = Number.parseInt(draft, 10);
    const draftError = draftProblem(drafted, durations);

    function onAdd() {
        if (draftError !== undefined || !Number.isFinite(drafted)) return;

        save.mutate(
            { durationOptions: [...durations, drafted].sort((a, b) => a - b) },
            { onSuccess: () => setDraft('') },
        );
    }

    // The default has to stay bookable, so it cannot be the row you remove.
    // The pane hides the control on that row; the server refuses it too.
    function onRemove(minutes: number) {
        save.mutate({ durationOptions: durations.filter((d) => d !== minutes) });
    }

    function onSetDefault(minutes: number) {
        save.mutate({ defaultDuration: minutes });
    }

    return (
        <Pane
            title="Appointments"
            onBack={onBack}
            refreshControl={refreshControl}
            testID="settings-appointments"
        >
            {settings.isLoading ? <SkeletonRows count={5} /> : null}

            {settings.error ? (
                <ErrorState
                    message={errorText(settings.error)}
                    onRetry={settings.refetch}
                    retrying={settings.isFetching}
                />
            ) : null}

            {data ? (
                <>
                    {save.error ? (
                        <Callout tone="warning" title="Not saved">
                            {errorText(save.error)}
                        </Callout>
                    ) : null}

                    <View style={styles.section}>
                        <SectionLabel
                            inset={false}
                            action={
                                <Text variant="caption" weight="medium" tone="muted">
                                    Tap a circle to set the default
                                </Text>
                            }
                        >
                            DURATION OPTIONS
                        </SectionLabel>

                        <Card>
                            {durations.map((minutes, index) => {
                                const isDefault = minutes === data.defaultDuration;

                                return (
                                    <View key={minutes}>
                                        {index > 0 ? <CardDivider /> : null}
                                        <View style={[styles.row, isDefault && styles.defaultRow]}>
                                            <Radio
                                                selected={isDefault}
                                                onPress={() => onSetDefault(minutes)}
                                                disabled={busy}
                                                accessibilityLabel={`Make ${minutes} minutes the default`}
                                                testID={`duration-default-${minutes}`}
                                            />

                                            <Text variant="amount" style={styles.minutes}>
                                                {String(minutes)}
                                            </Text>
                                            <Text variant="subhead" tone="muted">
                                                min
                                            </Text>

                                            {isDefault ? <Tag tone="muted">DEFAULT</Tag> : null}

                                            <View style={styles.rowEnd}>
                                                {isDefault ? null : (
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Remove ${minutes} minutes`}
                                                        onPress={() => onRemove(minutes)}
                                                        disabled={busy}
                                                        testID={`duration-remove-${minutes}`}
                                                        style={({ pressed }) => [
                                                            styles.remove,
                                                            pressed && styles.pressed,
                                                        ]}
                                                    >
                                                        <CloseIcon size={15} />
                                                    </Pressable>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}

                            <View style={styles.addRow}>
                                <View style={styles.addField}>
                                    <NumericField
                                        variant="end"
                                        suffix="min"
                                        value={draft}
                                        onChangeText={setDraft}
                                        placeholder="—"
                                        accessibilityLabel="New duration in minutes"
                                        error={draft.trim() === '' ? undefined : draftError}
                                        testID="duration-draft"
                                    />
                                </View>
                                <Button
                                    label="Add"
                                    onPress={onAdd}
                                    loading={save.isPending}
                                    disabled={draft.trim() === '' || draftError !== undefined || busy}
                                    icon={<PlusIcon size={14} />}
                                    testID="duration-add"
                                />
                            </View>
                        </Card>

                        <View style={styles.quick}>
                            {QUICK_ADDS.filter((n) => !durations.includes(n)).map((n) => (
                                <Chip
                                    key={n}
                                    label={`+ ${n}`}
                                    onPress={() => setDraft(String(n))}
                                    testID={`duration-quick-${n}`}
                                />
                            ))}
                        </View>
                    </View>

                    <Card padded style={styles.defaultCard}>
                        <SectionLabel inset={false}>DEFAULT DURATION</SectionLabel>
                        <View style={styles.figure}>
                            <Text variant="figure">{String(data.defaultDuration)}</Text>
                            <Text variant="callout" tone="muted">
                                min
                            </Text>
                        </View>
                        <Text variant="footnote" tone="muted">
                            Pre-filled when booking a new appointment. It must be one of the options above —
                            pick another option first if you want to remove it.
                        </Text>
                    </Card>
                </>
            ) : null}
        </Pane>
    );
}

/**
 * Answered on the phone rather than by the server: a duration already offered
 * would be deduplicated silently, and one out of range would come back as a
 * generic validation failure a second later. Both are worth saying under the
 * field while the number is still being typed.
 */
function draftProblem(minutes: number, offered: readonly number[]): string | undefined {
    if (!Number.isFinite(minutes)) return 'Whole minutes only.';
    if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
        return `Between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes.`;
    }
    if (offered.includes(minutes)) return 'That one is already offered.';
    return undefined;
}

const styles = StyleSheet.create({
    section: { gap: space[2] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[2],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
    },
    // The default row is tinted, not bordered: it is the one already chosen,
    // not the one being pointed at.
    defaultRow: { backgroundColor: color.canvas },
    minutes: { minWidth: 34 },
    rowEnd: { flex: 1, alignItems: 'flex-end' },
    remove: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
    },
    pressed: { backgroundColor: color.surface2 },

    addRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        padding: space[3],
        backgroundColor: color.canvas,
    },
    addField: { flex: 1 },

    quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1.5] },

    defaultCard: { gap: space[2] },
    figure: { flexDirection: 'row', alignItems: 'baseline', gap: space[1.5] },
});
