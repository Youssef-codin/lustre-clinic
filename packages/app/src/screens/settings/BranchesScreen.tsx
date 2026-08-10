import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
    ActionBar,
    AddButton,
    Button,
    Callout,
    Card,
    CardDivider,
    Chevron,
    ConfirmSheet,
    EmptyState,
    PushView,
    SectionLabel,
    Tag,
    Textarea,
    TextField,
    Toast,
} from '../../components/ui';
import { color, size, space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { api } from './data/_LocalApi';
import { errorMessage, useMutation, useQuery } from './data/hooks';
import type { Branch } from './data/types';

/**
 * Settings → Branches (SPEC §12).
 *
 * Branches are never deleted. Appointments reference them and the history has to
 * keep making sense, so the verb is deactivate — the same verb procedures and
 * patient fields use (§7.8), and the same guarantee: it stops appearing in the
 * pickers and keeps every appointment that already names it.
 */
export function BranchesScreen({ onBack }: { onBack: () => void }) {
    const branches = useQuery(useCallback(() => api.branch.list(true), []));
    const [editing, setEditing] = useState<Branch | 'new' | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const active = branches.data?.filter((b) => b.active) ?? [];
    const inactive = branches.data?.filter((b) => !b.active) ?? [];

    return (
        <>
            <Pane
                title="Branches"
                onBack={onBack}
                overlay={
                    <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
                }
            >
                {branches.loading ? <SkeletonRows count={3} /> : null}

                {branches.error ? (
                    <ErrorState
                        message={errorMessage(branches.error) ?? ''}
                        onRetry={branches.reload}
                        retrying={branches.reloading}
                    />
                ) : null}

                {branches.data ? (
                    <>
                        {active.length === 0 ? (
                            <EmptyState
                                weight="panel"
                                title="No branches yet"
                                body="A branch is where an appointment happens. Add the clinic itself first."
                                actionLabel="Add a branch"
                                onAction={() => setEditing('new')}
                            />
                        ) : (
                            <View style={styles.section}>
                                <SectionLabel inset={false} count={active.length}>
                                    OPEN
                                </SectionLabel>
                                <Card>
                                    {active.map((branch, index) => (
                                        <View key={branch.id}>
                                            {index > 0 ? <CardDivider /> : null}
                                            <BranchRow branch={branch} onPress={() => setEditing(branch)} />
                                        </View>
                                    ))}
                                </Card>
                            </View>
                        )}

                        {active.length > 0 ? (
                            <AddButton label="Add a branch" onPress={() => setEditing('new')} />
                        ) : null}

                        {inactive.length > 0 ? (
                            <View style={styles.section}>
                                <SectionLabel inset={false} count={inactive.length}>
                                    DEACTIVATED
                                </SectionLabel>
                                <Card variant="dashed">
                                    {inactive.map((branch, index) => (
                                        <View key={branch.id}>
                                            {index > 0 ? <CardDivider /> : null}
                                            <BranchRow branch={branch} onPress={() => setEditing(branch)} />
                                        </View>
                                    ))}
                                </Card>
                                <Text variant="footnote" tone="muted" style={styles.note}>
                                    Deactivated branches stay on every appointment that already names them.
                                </Text>
                            </View>
                        ) : null}
                    </>
                ) : null}
            </Pane>

            <PushView visible={editing !== null}>
                {editing !== null ? (
                    <BranchEditor
                        branch={editing === 'new' ? null : editing}
                        onClose={() => setEditing(null)}
                        onSaved={(message) => {
                            setEditing(null);
                            setToast(message);
                            branches.reload();
                        }}
                    />
                ) : null}
            </PushView>
        </>
    );
}

function BranchRow({ branch, onPress }: { branch: Branch; onPress: () => void }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={branch.name}
            onPress={onPress}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
            <View style={styles.rowText}>
                <View style={styles.rowTitle}>
                    <Text variant="body" weight="medium">
                        {branch.name}
                    </Text>
                    {branch.active ? null : (
                        <Tag tone="muted" variant="muted">
                            INACTIVE
                        </Tag>
                    )}
                </View>
                {branch.address ? (
                    <Text variant="subhead" tone="muted" numberOfLines={1}>
                        {branch.address}
                    </Text>
                ) : null}
            </View>
            <Chevron direction="forward" tone="muted" />
        </Pressable>
    );
}

type BranchEditorProps = {
    branch: Branch | null;
    onClose: () => void;
    onSaved: (message: string) => void;
};

function BranchEditor({ branch, onClose, onSaved }: BranchEditorProps) {
    const [name, setName] = useState(branch?.name ?? '');
    const [address, setAddress] = useState(branch?.address ?? '');
    const [submitted, setSubmitted] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const save = useMutation((input: { name: string; address: string }) =>
        branch ? api.branch.update({ id: branch.id, ...input }) : api.branch.create(input),
    );

    const setActive = useMutation((active: boolean) => api.branch.update({ id: branch?.id ?? '', active }));

    const nameError = submitted && name.trim() === '' ? 'A branch needs a name.' : undefined;
    const busy = save.pending || setActive.pending;

    async function onSave() {
        setSubmitted(true);
        if (name.trim() === '') return;
        const saved = await save.run({ name, address });
        if (saved) onSaved(branch ? 'Branch saved' : 'Branch added');
    }

    async function onToggleActive() {
        if (!branch) return;
        const updated = await setActive.run(!branch.active);
        setConfirming(false);
        if (updated) onSaved(updated.active ? 'Branch reactivated' : 'Branch deactivated');
    }

    return (
        <Pane
            title={branch ? 'Edit branch' : 'New branch'}
            // A write is in flight: leaving now would hide whether it landed.
            onBack={busy ? () => {} : onClose}
            footer={
                <ActionBar
                    primaryLabel={busy ? 'Saving' : 'Save'}
                    onPrimary={onSave}
                    primaryLoading={save.pending}
                    primaryDisabled={setActive.pending}
                    secondaryLabel="Cancel"
                    onSecondary={busy ? undefined : onClose}
                />
            }
        >
            {save.error || setActive.error ? (
                <Callout tone="warning" title="Not saved">
                    {errorMessage(save.error ?? setActive.error) ?? ''}
                </Callout>
            ) : null}

            <Card padded style={styles.form}>
                <TextField
                    label="Name"
                    required
                    value={name}
                    onChangeText={setName}
                    placeholder="Heliopolis"
                    error={nameError}
                    autoCapitalize="words"
                />
                <Textarea
                    label="Address"
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Street, area"
                    hint="Shown on the branch list. Not sent to patients."
                />
            </Card>

            {branch ? (
                <Card padded style={styles.form}>
                    <Text variant="subhead" tone="muted">
                        {branch.active
                            ? 'Deactivating hides this branch from the booking screen. Appointments already at this branch keep it.'
                            : 'This branch is hidden from the booking screen. Reactivating puts it back.'}
                    </Text>
                    <Button
                        label={branch.active ? 'Deactivate branch' : 'Reactivate branch'}
                        variant={branch.active ? 'danger' : 'secondary'}
                        onPress={() => setConfirming(true)}
                        loading={setActive.pending}
                        block
                    />
                </Card>
            ) : null}

            <ConfirmSheet
                visible={confirming}
                title={branch?.active ? 'Deactivate this branch?' : 'Reactivate this branch?'}
                body={
                    branch?.active
                        ? 'It stops appearing when booking. Nothing is deleted — every appointment already at this branch keeps it.'
                        : 'It appears when booking again.'
                }
                confirmLabel={branch?.active ? 'Deactivate' : 'Reactivate'}
                destructive={branch?.active}
                loading={setActive.pending}
                onConfirm={onToggleActive}
                onCancel={() => setConfirming(false)}
            />
        </Pane>
    );
}

const styles = StyleSheet.create({
    section: { gap: space[2] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[2],
        paddingHorizontal: space[4],
        paddingVertical: space[2.5],
    },
    pressed: { backgroundColor: color.surface2 },
    rowText: { flex: 1, gap: space[0.5] },
    rowTitle: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    note: { paddingHorizontal: space[1] },
    form: { gap: space[4] },
});
