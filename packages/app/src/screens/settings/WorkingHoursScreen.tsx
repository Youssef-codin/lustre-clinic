/**
 * Settings → Working hours. Seven rows, one per weekday; a weekday with no row
 * is closed — absence, not a flag — so the editor's switch is `setDay` against
 * `clearDay`. The schedule only supplies a default; booking outside opening
 * hours is the secretary's call and nothing here blocks it. Deactivated
 * branches stay in the lists, and this day's own branch is kept as a select
 * option even if it has since been deactivated, so it never draws as an unset
 * placeholder.
 *
 * Times cross the wire as zero-padded `HH:MM`, so string comparison stays
 * chronological, and are held in the editor as minutes from midnight — which is
 * what the picker speaks and what makes "closes after opens" a number
 * comparison rather than a string one. `minutesFromTime` / `timeFromMinutes`
 * are the same pair the reminders pane converts with. What the user reads is
 * always 12-hour, from `domain/clock`; the `HH:MM` never reaches a screen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type RouterOutput, useTRPC } from '../../api';
import { formatSpan } from '../../components/domain';
import {
    Button,
    Callout,
    Card,
    CardDivider,
    Chevron,
    Select,
    Sheet,
    Switch,
    Tag,
    Toast,
    usePullToRefresh,
} from '../../components/ui';
import { color, size, space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { TimePickerField } from './components/TimePickerField';
import { errorText } from './data/errors';
import { minutesFromTime, timeFromMinutes } from './data/reminders';

type Branch = RouterOutput['branch']['list'][number];
type ClinicDay = RouterOutput['settings']['schedule'][number];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function daySpan(day: ClinicDay): string {
    return formatSpan(minutesFromTime(day.opensAt), minutesFromTime(day.closesAt));
}

export function WorkingHoursScreen({ onBack }: { onBack: () => void }) {
    const trpc = useTRPC();

    const schedule = useQuery(trpc.settings.schedule.queryOptions());
    const branches = useQuery(trpc.branch.list.queryOptions({ includeInactive: true }));
    const [editing, setEditing] = useState<number | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const loading = schedule.isLoading || branches.isLoading;
    const error = schedule.error ?? branches.error;
    const byWeekday = new Map((schedule.data ?? []).map((day) => [day.weekday, day]));
    const branchName = (id: string) => branches.data?.find((b) => b.id === id)?.name ?? 'Unknown branch';

    function reload() {
        void schedule.refetch();
        void branches.refetch();
    }

    // Both reads: a day names a branch, so a stale branch list draws a day
    // against "Unknown branch".
    const refreshControl = usePullToRefresh(reload, schedule.isFetching || branches.isFetching);

    return (
        <Pane
            title="Working hours"
            onBack={onBack}
            refreshControl={refreshControl}
            overlay={
                <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
            }
        >
            {loading ? <SkeletonRows count={7} trailing /> : null}

            {error ? (
                <ErrorState
                    message={errorText(error)}
                    onRetry={reload}
                    retrying={schedule.isFetching || branches.isFetching}
                />
            ) : null}

            {schedule.data && branches.data ? (
                <>
                    <Card>
                        {WEEKDAYS.map((name, weekday) => (
                            <View key={name}>
                                {weekday > 0 ? <CardDivider /> : null}
                                <DayRow
                                    name={name}
                                    day={byWeekday.get(weekday)}
                                    branchName={branchName}
                                    onPress={() => setEditing(weekday)}
                                />
                            </View>
                        ))}
                    </Card>

                    <Text variant="footnote" tone="muted" style={styles.note}>
                        These are the hours the day view draws and the booking screen defaults to. Booking
                        outside them is still allowed.
                    </Text>
                </>
            ) : null}

            {editing !== null && branches.data ? (
                <DayEditor
                    weekday={editing}
                    name={WEEKDAYS[editing] ?? ''}
                    day={byWeekday.get(editing)}
                    branches={branches.data}
                    onClose={() => setEditing(null)}
                    onSaved={(message) => {
                        setEditing(null);
                        setToast(message);
                    }}
                />
            ) : null}
        </Pane>
    );
}

type DayRowProps = {
    name: string;
    day: ClinicDay | undefined;
    branchName: (id: string) => string;
    onPress: () => void;
};

function DayRow({ name, day, branchName, onPress }: DayRowProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={day ? `${name}, ${daySpan(day)}` : `${name}, closed`}
            onPress={onPress}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
            <View style={styles.rowText}>
                <Text variant="body" weight="medium">
                    {name}
                </Text>
                {day ? (
                    <Text variant="subhead" tone="muted" numberOfLines={1}>
                        {branchName(day.branchId)}
                    </Text>
                ) : null}
            </View>

            {day ? (
                // Smaller than the 24-hour figure it replaces: two meridiems
                // make the span half again as long, and it shares the row with
                // a weekday, a branch name and a chevron.
                <Text variant="subhead" tone="ink2" script="mono" numberOfLines={1}>
                    {daySpan(day)}
                </Text>
            ) : (
                <Tag tone="muted" variant="muted">
                    CLOSED
                </Tag>
            )}
            <Chevron direction="forward" tone="muted" />
        </Pressable>
    );
}

type DayEditorProps = {
    weekday: number;
    name: string;
    day: ClinicDay | undefined;
    branches: Branch[];
    onClose: () => void;
    onSaved: (message: string) => void;
};

function DayEditor({ weekday, name, day, branches, onClose, onSaved }: DayEditorProps) {
    const [open, setOpen] = useState(day !== undefined);
    const [branchId, setBranchId] = useState(day?.branchId ?? branches.find((b) => b.active)?.id ?? null);

    const [opens, setOpens] = useState(minutesFromTime(day?.opensAt ?? '10:00'));
    const [closes, setCloses] = useState(minutesFromTime(day?.closesAt ?? '18:00'));

    const options = branches
        .filter((branch) => branch.active || branch.id === day?.branchId)
        .map((branch) => ({
            value: branch.id,
            label: branch.active ? branch.name : `${branch.name} (deactivated)`,
        }));

    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const onSettingsWritten = () => queryClient.invalidateQueries(trpc.settings.pathFilter());

    const setDay = useMutation(trpc.settings.setDay.mutationOptions({ onSuccess: onSettingsWritten }));
    const clearDay = useMutation(trpc.settings.clearDay.mutationOptions({ onSuccess: onSettingsWritten }));

    // A number comparison now the picker counts minutes; the old string one
    // only worked because every option was zero-padded `HH:MM`.
    const orderError = open && opens >= closes ? 'Closing time must be after opening.' : undefined;
    const canSave = !open || (branchId !== null && orderError === undefined);
    const pending = setDay.isPending || clearDay.isPending;
    const failure = setDay.error ?? clearDay.error;

    function onSave() {
        if (!open) {
            clearDay.mutate({ weekday }, { onSuccess: () => onSaved(`${name} marked closed`) });
            return;
        }
        if (!branchId) return;
        setDay.mutate(
            {
                weekday,
                branchId,
                opensAt: timeFromMinutes(opens),
                closesAt: timeFromMinutes(closes),
            },
            { onSuccess: () => onSaved(`${name} saved`) },
        );
    }

    return (
        <Sheet
            visible
            onClose={pending ? () => {} : onClose}
            dismissable={!pending}
            title={name}
            subtitle={open ? 'Open this day' : 'Closed all day'}
            footer={<Button label="Save" onPress={onSave} loading={pending} disabled={!canSave} block />}
        >
            {failure ? (
                <Callout tone="warning" title="Not saved">
                    {errorText(failure, { NOT_FOUND: 'That branch is no longer set up. Pick another one.' })}
                </Callout>
            ) : null}

            <View style={styles.switchRow}>
                <View style={styles.rowText}>
                    <Text variant="body" weight="medium">
                        Open on {name}
                    </Text>
                    <Text variant="subhead" tone="muted">
                        Off means closed all day.
                    </Text>
                </View>
                <Switch value={open} onValueChange={setOpen} accessibilityLabel={`Open on ${name}`} />
            </View>

            {open ? (
                <>
                    <Select
                        label="Branch"
                        required
                        options={options}
                        value={branchId}
                        onChange={setBranchId}
                        placeholder="Pick a branch"
                        sheetTitle="Branch"
                    />
                    <TimePickerField label="Opens" value={opens} onChange={setOpens} />
                    <TimePickerField label="Closes" value={closes} onChange={setCloses} error={orderError} />
                </>
            ) : null}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[2],
        paddingHorizontal: space[4],
        paddingVertical: space[2],
    },
    pressed: { backgroundColor: color.surface2 },
    rowText: { flex: 1, gap: space[0.5] },
    note: { paddingHorizontal: space[1] },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: size.row },
});
