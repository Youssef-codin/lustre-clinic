/**
 * Settings → Branches. Branches are never deleted — visits, invoices and
 * patients keep pointing at them forever — so the verb is deactivate, the same
 * as procedures and patient fields, and the pane says so in as many words
 * rather than leaving someone hunting for a delete that is not there.
 *
 * A branch is a card of its own rather than a row in a shared card, because the
 * design gives each three lines that belong together — name, address, and how
 * big and how old it is — and a divider between three-line rows reads as a
 * table of unrelated fields. Inactive branches keep the shape and lose the
 * fill: dashed and dimmed, still tappable, still editable.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
    ActionBar,
    Button,
    Callout,
    Card,
    Chevron,
    ConfirmSheet,
    Dot,
    EmptyState,
    IconButton,
    PushView,
    SectionLabel,
    Tag,
    Textarea,
    TextField,
    Toast,
    usePullToRefresh,
} from '../../components/ui';
import { color, radius, space, Text } from '../../theme';
import { InfoIcon, PlusIcon, PowerIcon } from './components/icons';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { api } from './data/_LocalApi';
import { errorMessage, useMutation, useQuery } from './data/hooks';
import type { Branch } from './data/types';

export function BranchesScreen({ onBack }: { onBack: () => void }) {
    const branches = useQuery(
        useCallback(
            async () => ({
                rows: await api.branch.list({ includeInactive: true }),
                currentId: await api.branch.current(),
            }),
            [],
        ),
    );
    const [editing, setEditing] = useState<Branch | 'new' | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const active = branches.data?.rows.filter((b) => b.active) ?? [];
    const inactive = branches.data?.rows.filter((b) => !b.active) ?? [];

    // Settings are read once when the pane opens, so a branch added on the
    // doctor's phone is invisible here until something asks again. The editor
    // is a pane of its own, so a pull can never land under a half-typed draft.
    const refreshControl = usePullToRefresh(branches.reload, branches.loading || branches.reloading);

    return (
        <>
            <Pane
                title="Branches"
                onBack={onBack}
                refreshControl={refreshControl}
                testID="settings-branches-pane"
                trailing={
                    branches.data ? (
                        <IconButton
                            accessibilityLabel="Add a branch"
                            variant="filled"
                            tone="ink"
                            icon={<PlusIcon size={13} />}
                            onPress={() => setEditing('new')}
                            testID="branch-add"
                        />
                    ) : undefined
                }
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
                                <SectionLabel inset={false}>ACTIVE</SectionLabel>
                                {active.map((branch) => (
                                    <BranchCard
                                        key={branch.id}
                                        branch={branch}
                                        here={branch.id === branches.data?.currentId}
                                        onPress={() => setEditing(branch)}
                                    />
                                ))}
                            </View>
                        )}

                        {inactive.length > 0 ? (
                            <View style={styles.section}>
                                <SectionLabel inset={false}>INACTIVE</SectionLabel>
                                {inactive.map((branch) => (
                                    <BranchCard
                                        key={branch.id}
                                        branch={branch}
                                        here={false}
                                        onPress={() => setEditing(branch)}
                                    />
                                ))}
                                <Text variant="footnote" tone="muted" style={styles.note}>
                                    Branches are never deleted — their visits, invoices and patients stay
                                    attached to them. Deactivating just hides a branch from new bookings.
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

function BranchCard({ branch, here, onPress }: { branch: Branch; here: boolean; onPress: () => void }) {
    const stats = branch.active
        ? `${branch.patientCount} · since ${branch.openedYear}`
        : `${branch.patientCount} · since ${branch.closedOn ?? '—'}`;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${branch.name}. ${stats}`}
            onPress={onPress}
            testID={`branch-${branch.id}`}
            style={({ pressed }) => [
                styles.card,
                !branch.active && styles.inactiveCard,
                pressed && styles.pressed,
            ]}
        >
            <View style={styles.cardText}>
                <View style={styles.cardTitle}>
                    <Text variant="headline" tone={branch.active ? 'ink' : 'muted'}>
                        {branch.name}
                    </Text>
                    {here ? (
                        <Tag tone="ink" variant="filled">
                            {"YOU'RE HERE"}
                        </Tag>
                    ) : null}
                    {branch.active ? null : <Tag tone="muted">INACTIVE</Tag>}
                </View>

                {branch.address ? (
                    <Text variant="footnote" tone="muted" numberOfLines={1}>
                        {branch.address}
                    </Text>
                ) : null}

                <Text variant="caption" weight="medium" tone="muted" script="mono">
                    {stats}
                </Text>
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
    const [phone, setPhone] = useState(branch?.phone ?? '');
    const [submitted, setSubmitted] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const save = useMutation((input: { name: string; address: string; phone: string }) =>
        branch ? api.branch.update({ id: branch.id, ...input }) : api.branch.create(input),
    );

    const setActive = useMutation((active: boolean) => api.branch.update({ id: branch?.id ?? '', active }));

    const nameError = submitted && name.trim() === '' ? 'A branch needs a name.' : undefined;
    const busy = save.pending || setActive.pending;

    async function onSave() {
        setSubmitted(true);
        if (name.trim() === '') return;

        const saved = await save.run({ name, address, phone });
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
            onBack={busy ? () => {} : onClose}
            testID="branch-editor"
            footer={
                // Save alone, as `settings.html` draws it: the pane has a back
                // button, and a Cancel beside Save is a second way out of a
                // screen that already has one.
                <ActionBar
                    primaryLabel={busy ? 'Saving' : branch ? 'Save branch' : 'Create branch'}
                    onPrimary={onSave}
                    primaryLoading={save.pending}
                    primaryDisabled={setActive.pending}
                />
            }
        >
            {save.error || setActive.error ? (
                <Callout tone="warning" title="Not saved">
                    {errorMessage(save.error ?? setActive.error) ?? ''}
                </Callout>
            ) : null}

            {branch && !branch.active ? (
                <Callout tone="info" icon={<InfoIcon size={16} />}>
                    This branch is inactive. You can still edit its details and reopen it at any time.
                </Callout>
            ) : null}

            <View style={styles.section}>
                <SectionLabel inset={false}>DETAILS</SectionLabel>
                <Card padded style={styles.form}>
                    <TextField
                        label="Branch name"
                        required
                        value={name}
                        onChangeText={setName}
                        placeholder="Heliopolis"
                        error={nameError}
                        autoCapitalize="words"
                        testID="branch-name"
                    />
                    <Textarea
                        label="Address"
                        value={address}
                        onChangeText={setAddress}
                        placeholder="Street, area"
                        testID="branch-address"
                    />
                    <TextField
                        label="Phone"
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="02 0000 0000"
                        keyboardType="phone-pad"
                        testID="branch-phone"
                    />
                </Card>
            </View>

            {branch ? (
                <View style={styles.section}>
                    <SectionLabel inset={false}>STATUS</SectionLabel>

                    <Card padded style={styles.status}>
                        <View style={styles.statusHead}>
                            <Dot tone={branch.active ? 'wa' : 'muted'} size={8} />
                            <Text variant="body" weight="semibold" style={styles.statusLabel}>
                                {branch.active ? 'Active' : 'Inactive'}
                            </Text>
                            <Text variant="footnote" tone="muted" script="mono">
                                {branch.active
                                    ? `since ${branch.openedYear}`
                                    : `since ${branch.closedOn ?? '—'}`}
                            </Text>
                        </View>

                        <Text variant="footnote" tone="muted">
                            {branch.active
                                ? 'Appears in the branch picker and can take new bookings.'
                                : 'Hidden from the branch picker. Past visits and invoices are untouched and still searchable.'}
                        </Text>

                        <Button
                            label={branch.active ? 'Deactivate branch' : 'Reactivate branch'}
                            variant={branch.active ? 'danger' : 'secondary'}
                            icon={
                                <PowerIcon
                                    size={15}
                                    stroke={branch.active ? color.danger : color.ink}
                                    width={2.2}
                                />
                            }
                            onPress={() => setConfirming(true)}
                            loading={setActive.pending}
                            block
                        />

                        <Text variant="caption" tone="muted" style={styles.noDelete}>
                            Branches can't be deleted — history stays attached.
                        </Text>
                    </Card>
                </View>
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

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[3.5],
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    // Dashed and unfilled: still a branch, no longer somewhere you can book.
    inactiveCard: {
        borderStyle: 'dashed',
        borderColor: color.outline,
        backgroundColor: color.transparent,
    },
    pressed: { backgroundColor: color.surface2 },
    cardText: { flex: 1, minWidth: 0, gap: space[0.5] },
    cardTitle: { flexDirection: 'row', alignItems: 'center', gap: space[2] },

    note: { paddingHorizontal: space[0.5] },
    form: { gap: space[4] },

    status: { gap: space[2.5] },
    statusHead: { flexDirection: 'row', alignItems: 'center', gap: space[2.5] },
    statusLabel: { flex: 1 },
    noDelete: { textAlign: 'center' },
});
