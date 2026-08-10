import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
} from '../../components/ui';
import { color, size, space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { api } from './data/_LocalApi';
import { errorMessage, useMutation, useQuery } from './data/hooks';
import type { Branch, ClinicDay } from './data/types';

/**
 * Settings → Working hours (MAW-1).
 *
 * Seven rows, one per weekday. A weekday with no row is closed — that is the
 * whole encoding, so "closed" is not a flag on a day, it is the absence of one,
 * and the switch in the editor is `setDay` against `clearDay`.
 *
 * The schedule only ever supplies a default. Booking outside opening hours is
 * the secretary's call and nothing here blocks it.
 */

/** `0` is Sunday, matching `Date#getDay` and the `weekday` column. */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Half-hour slots, 07:00 to 22:00. `ui/` has no time field — see BLOCKED.md. */
const TIMES = Array.from({ length: 31 }, (_, index) => {
    const minutes = 7 * 60 + index * 30;
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

export function WorkingHoursScreen({ onBack }: { onBack: () => void }) {
    const schedule = useQuery(useCallback(() => api.settings.schedule(), []));
    const branches = useQuery(useCallback(() => api.branch.list(), []));
    const [editing, setEditing] = useState<number | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const loading = schedule.loading || branches.loading;
    const error = schedule.error ?? branches.error;
    const byWeekday = new Map((schedule.data ?? []).map((day) => [day.weekday, day]));
    const branchName = (id: string) => branches.data?.find((b) => b.id === id)?.name ?? 'Unknown branch';

    function reload() {
        schedule.reload();
        branches.reload();
    }

    return (
        <Pane
            title="Working hours"
            onBack={onBack}
            overlay={
                <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
            }
        >
            {loading ? <SkeletonRows count={7} trailing /> : null}

            {error ? (
                <ErrorState
                    message={errorMessage(error) ?? ''}
                    onRetry={reload}
                    retrying={schedule.reloading || branches.reloading}
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
                        schedule.reload();
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
            accessibilityLabel={day ? `${name}, ${day.opensAt} to ${day.closesAt}` : `${name}, closed`}
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
                <Text variant="amount" tone="ink2">
                    {`${day.opensAt}–${day.closesAt}`}
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

/**
 * One day, in a sheet. The switch is the difference between a row existing and
 * not existing, so turning it off is `clearDay` and turning it on is `setDay`
 * with whatever the fields currently hold.
 */
function DayEditor({ weekday, name, day, branches, onClose, onSaved }: DayEditorProps) {
    const [open, setOpen] = useState(day !== undefined);
    const [branchId, setBranchId] = useState(day?.branchId ?? branches[0]?.id ?? null);
    const [opensAt, setOpensAt] = useState(day?.opensAt ?? '10:00');
    const [closesAt, setClosesAt] = useState(day?.closesAt ?? '18:00');

    const save = useMutation(async () => {
        if (!open) {
            await api.settings.clearDay(weekday);
            return 'closed' as const;
        }
        if (!branchId) throw new Error('pick a branch');
        await api.settings.setDay({ weekday, branchId, opensAt, closesAt });
        return 'open' as const;
    });

    // Both are zero-padded `HH:MM`, so comparing them as strings orders them by
    // time. Caught here as well as on the server so the sheet can say which
    // field is wrong.
    const orderError = open && !(opensAt < closesAt) ? 'Closing time must be after opening.' : undefined;
    const canSave = !open || (branchId !== null && orderError === undefined);

    async function onSave() {
        const result = await save.run(undefined);
        if (result === 'open') onSaved(`${name} saved`);
        if (result === 'closed') onSaved(`${name} marked closed`);
    }

    return (
        <Sheet
            visible
            onClose={save.pending ? () => {} : onClose}
            dismissable={!save.pending}
            title={name}
            subtitle={open ? 'Open this day' : 'Closed all day'}
            footer={<Button label="Save" onPress={onSave} loading={save.pending} disabled={!canSave} block />}
        >
            {save.error ? (
                <Callout tone="warning" title="Not saved">
                    {errorMessage(save.error) ?? ''}
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
                        options={branches.map((b) => ({ value: b.id, label: b.name }))}
                        value={branchId}
                        onChange={setBranchId}
                        placeholder="Pick a branch"
                        sheetTitle="Branch"
                    />
                    <Select
                        label="Opens"
                        options={TIMES}
                        value={opensAt}
                        onChange={setOpensAt}
                        sheetTitle="Opening time"
                    />
                    <Select
                        label="Closes"
                        options={TIMES}
                        value={closesAt}
                        onChange={setClosesAt}
                        error={orderError}
                        sheetTitle="Closing time"
                    />
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
