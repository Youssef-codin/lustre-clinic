/**
 * Settings → Procedures & prices. The catalogue is a self-referencing tree,
 * one level deep: a row with children is a category — a heading with no price
 * that never reaches a visit — and only leaves are chargeable, each priced on
 * its own (a variant is a leaf). Nothing is ever deleted; deactivate stops it
 * appearing in the picker and keeps it on every visit that already charged for
 * it, at the snapshot price, so edits are forward-only. Inactive rows are
 * folded away behind "Show N inactive" rather than listed dimmed: a clinic
 * accumulates far more retired procedures than live ones, and this is the
 * screen where the live price list is read. The fold opens itself when an
 * inactive procedure is the one being edited, because this is also the only
 * screen where a deactivated procedure is brought back. In reorder mode the
 * price is dropped rather than sat beside the arrows — a tappable price next to
 * small buttons reprises by accident.
 */
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
    NumericField,
    PushView,
    ReorderControls,
    SectionLabel,
    Select,
    Switch,
    Tag,
    TextField,
    Toast,
    usePullToRefresh,
} from '../../components/ui';
import { color, radius, size, space, Text } from '../../theme';
import { _LocalMoneyValue, poundsToPiastres, sanitisePounds } from './components/_LocalMoneyValue';
import { EyeIcon, PowerIcon } from './components/icons';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { api } from './data/_LocalApi';
import { errorMessage, useMutation, useQuery } from './data/hooks';
import type { Procedure, ProcedureNode } from './data/types';

export function ProceduresScreen({ onBack }: { onBack: () => void }) {
    const tree = useQuery(useCallback(() => api.procedure.tree({ includeInactive: true }), []));
    const [editing, setEditing] = useState<Procedure | 'new' | null>(null);
    const [addingTo, setAddingTo] = useState<ProcedureNode | null>(null);
    const [reordering, setReordering] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    /** Opening an inactive row unfolds the section it came from, so backing out
     * of the editor does not drop the row out of the list under the finger. */
    function edit(procedure: Procedure) {
        if (!procedure.active) setShowInactive(true);
        setEditing(procedure);
    }

    const reorder = useMutation((ids: string[]) => api.procedure.reorder(ids));

    async function move(siblings: readonly { id: string }[], index: number, delta: number) {
        const next = [...siblings];
        const moved = next[index];
        const target = next[index + delta];
        if (!moved || !target) return;
        next[index] = target;
        next[index + delta] = moved;
        await reorder.run(next.map((row) => row.id));
        tree.reload();
    }

    const all = tree.data ?? [];
    const empty = all.length === 0;

    // Reordering shows everything: the order being edited is the order of the
    // whole list, and moving a row past a hidden one is a move you cannot see.
    const visible = showInactive || reordering;
    const inactiveCount = all.flatMap((node) => [node, ...node.children]).filter((row) => !row.active).length;

    const nodes = visible
        ? all
        : all
              .filter((node) => node.active || node.children.some((child) => child.active))
              .map((node) => ({ ...node, children: node.children.filter((child) => child.active) }));

    // Not while reordering: the rows are being dragged against the order this
    // would replace, and a price list that reshuffles under a finger is worse
    // than a stale one.
    const refreshControl = usePullToRefresh(() => {
        if (!reordering) tree.reload();
    }, tree.loading || tree.reloading);

    return (
        <>
            <Pane
                title="Procedures & prices"
                onBack={reordering ? () => setReordering(false) : onBack}
                refreshControl={refreshControl}
                trailing={
                    empty ? null : (
                        <Button
                            label={reordering ? 'Done' : 'Reorder'}
                            variant="text"
                            size="md"
                            onPress={() => setReordering((on) => !on)}
                        />
                    )
                }
                overlay={
                    <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
                }
            >
                {tree.loading ? <SkeletonRows count={4} trailing /> : null}

                {tree.error ? (
                    <ErrorState
                        message={errorMessage(tree.error) ?? ''}
                        onRetry={tree.reload}
                        retrying={tree.reloading}
                    />
                ) : null}

                {reorder.error ? (
                    <Callout tone="warning" title="Order not saved">
                        {errorMessage(reorder.error) ?? ''}
                    </Callout>
                ) : null}

                {tree.data && empty ? (
                    <EmptyState
                        weight="panel"
                        title="No procedures yet"
                        body="These are what a visit is charged for. Add the checkup first — it is the line every visit starts with."
                        actionLabel="Add a procedure"
                        onAction={() => setEditing('new')}
                    />
                ) : null}

                {nodes.map((node, index) =>
                    node.selectable ? (
                        <Card key={node.id}>
                            <ProcedureRow
                                procedure={node}
                                reordering={reordering}
                                reorderDisabled={reorder.pending}
                                isFirst={index === 0}
                                isLast={index === nodes.length - 1}
                                onPress={() => edit(node)}
                                onMoveUp={() => move(nodes, index, -1)}
                                onMoveDown={() => move(nodes, index, 1)}
                            />
                        </Card>
                    ) : (
                        <View key={node.id} style={styles.category}>
                            <SectionLabel
                                inset={false}
                                count={node.children.length}
                                action={
                                    reordering ? (
                                        <ReorderControls
                                            itemLabel={node.name}
                                            isFirst={index === 0}
                                            isLast={index === nodes.length - 1}
                                            onMoveUp={() => move(nodes, index, -1)}
                                            onMoveDown={() => move(nodes, index, 1)}
                                        />
                                    ) : (
                                        <Button
                                            label="Rename"
                                            variant="text"
                                            size="md"
                                            onPress={() => edit(node)}
                                        />
                                    )
                                }
                            >
                                {node.name.toUpperCase()}
                            </SectionLabel>

                            <Card>
                                {node.children.map((child, childIndex) => (
                                    <View key={child.id}>
                                        {childIndex > 0 ? <CardDivider /> : null}
                                        <ProcedureRow
                                            procedure={child}
                                            reordering={reordering}
                                            reorderDisabled={reorder.pending}
                                            isFirst={childIndex === 0}
                                            isLast={childIndex === node.children.length - 1}
                                            onPress={() => edit(child)}
                                            onMoveUp={() => move(node.children, childIndex, -1)}
                                            onMoveDown={() => move(node.children, childIndex, 1)}
                                        />
                                    </View>
                                ))}

                                {reordering ? null : (
                                    <>
                                        <CardDivider />
                                        <AddButton
                                            variant="footer"
                                            label={`Add to ${node.name}`}
                                            onPress={() => setAddingTo(node)}
                                        />
                                    </>
                                )}
                            </Card>
                        </View>
                    ),
                )}

                {tree.data && !reordering && inactiveCount > 0 ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showInactive }}
                        onPress={() => setShowInactive((on) => !on)}
                        testID="procedures-inactive-toggle"
                        style={({ pressed }) => [styles.fold, pressed && styles.pressed]}
                    >
                        <EyeIcon size={13} />
                        <Text variant="subhead" weight="semibold" tone="muted">
                            {showInactive
                                ? `Hide ${inactiveCount} inactive`
                                : `Show ${inactiveCount} inactive`}
                        </Text>
                    </Pressable>
                ) : null}

                {tree.data && !empty && !reordering ? (
                    <AddButton label="Add a procedure" onPress={() => setEditing('new')} />
                ) : null}

                {tree.data && !empty ? (
                    <Text variant="footnote" tone="muted" style={styles.note}>
                        A procedure with subtypes is a heading — only the subtypes under it can go on a visit,
                        and each has its own price.
                    </Text>
                ) : null}
            </Pane>

            <PushView visible={editing !== null || addingTo !== null}>
                {editing !== null || addingTo !== null ? (
                    <ProcedureEditor
                        procedure={editing !== null && editing !== 'new' ? editing : null}
                        parent={addingTo}
                        categories={all.filter((node) => !node.selectable)}
                        onClose={() => {
                            setEditing(null);
                            setAddingTo(null);
                        }}
                        onSaved={(message) => {
                            setEditing(null);
                            setAddingTo(null);
                            setToast(message);
                            tree.reload();
                        }}
                    />
                ) : null}
            </PushView>
        </>
    );
}

type ProcedureRowProps = {
    procedure: Procedure;
    reordering: boolean;
    reorderDisabled: boolean;
    isFirst: boolean;
    isLast: boolean;
    onPress: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
};

function ProcedureRow({
    procedure,
    reordering,
    reorderDisabled,
    isFirst,
    isLast,
    onPress,
    onMoveUp,
    onMoveDown,
}: ProcedureRowProps) {
    const body = (
        <View style={[styles.rowText, !procedure.active && styles.dimmed]}>
            <Text variant="body" weight="medium">
                {procedure.name}
            </Text>
            <View style={styles.tags}>
                {procedure.isCheckup ? (
                    <Tag tone="accent" variant="filled">
                        CHECKUP
                    </Tag>
                ) : null}
                {procedure.isToothSpecific ? <Tag tone="muted">TOOTH</Tag> : null}
                {procedure.hasQuantity ? <Tag tone="muted">QTY</Tag> : null}
                {procedure.active ? null : (
                    <Tag tone="muted" variant="muted">
                        INACTIVE
                    </Tag>
                )}
            </View>
        </View>
    );

    if (reordering) {
        return (
            <View style={styles.row}>
                {body}
                <ReorderControls
                    itemLabel={procedure.name}
                    isFirst={isFirst || reorderDisabled}
                    isLast={isLast || reorderDisabled}
                    onMoveUp={onMoveUp}
                    onMoveDown={onMoveDown}
                />
            </View>
        );
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={procedure.name}
            onPress={onPress}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
            {body}
            <View style={!procedure.active && styles.dimmed}>
                <_LocalMoneyValue piastres={procedure.defaultPrice} />
            </View>
            <Chevron direction="forward" tone="muted" />
        </Pressable>
    );
}

type ProcedureEditorProps = {
    procedure: Procedure | null;
    parent: ProcedureNode | null;
    categories: ProcedureNode[];
    onClose: () => void;
    onSaved: (message: string) => void;
};

const NO_CATEGORY = 'none';

function ProcedureEditor({ procedure, parent, categories, onClose, onSaved }: ProcedureEditorProps) {
    const [name, setName] = useState(procedure?.name ?? '');
    const [price, setPrice] = useState(procedure ? String(Math.round(procedure.defaultPrice / 100)) : '');
    const [parentId, setParentId] = useState<string>(procedure?.parentId ?? parent?.id ?? NO_CATEGORY);
    const [toothSpecific, setToothSpecific] = useState(procedure?.isToothSpecific ?? false);
    const [hasQuantity, setHasQuantity] = useState(procedure?.hasQuantity ?? false);
    const [isCheckup, setIsCheckup] = useState(procedure?.isCheckup ?? false);
    const [submitted, setSubmitted] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const isCategory = categories.some((category) => category.id === procedure?.id);

    const save = useMutation(async () => {
        const input = {
            parentId: parentId === NO_CATEGORY ? null : parentId,
            name,
            defaultPrice: poundsToPiastres(price),
            hasQuantity,
            isToothSpecific: toothSpecific,
            isCheckup,
        };
        return procedure ? api.procedure.update({ id: procedure.id, ...input }) : api.procedure.create(input);
    });

    const setActive = useMutation((active: boolean) =>
        api.procedure.update({ id: procedure?.id ?? '', active }),
    );

    const nameError = submitted && name.trim() === '' ? 'A procedure needs a name.' : undefined;
    const busy = save.pending || setActive.pending;

    async function onSave() {
        setSubmitted(true);
        if (name.trim() === '') return;
        const saved = await save.run(undefined);
        if (saved) onSaved(procedure ? 'Procedure saved' : 'Procedure added');
    }

    async function onToggleActive() {
        if (!procedure) return;
        const updated = await setActive.run(!procedure.active);
        setConfirming(false);
        if (updated) onSaved(updated.active ? 'Procedure reactivated' : 'Procedure deactivated');
    }

    return (
        <Pane
            title={procedure ? 'Edit procedure' : 'New procedure'}
            subtitle={parent && !procedure ? `Under ${parent.name}` : undefined}
            onBack={busy ? () => {} : onClose}
            footer={
                // Save alone, as the mockup draws it: the pane has a back
                // button, and a Cancel beside Save on a screen reached by a row
                // tap is a second way to do what backing out already does.
                <ActionBar
                    primaryLabel={save.pending ? 'Saving' : 'Save'}
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

            {/* Price first, the way the mockup orders it: on a screen opened to
                change a price, the field being come for should not be third. */}
            <Card padded style={styles.form}>
                {isCategory ? null : (
                    <NumericField
                        label="Price"
                        variant="display"
                        prefix="EGP"
                        value={price}
                        onChangeText={(next) => setPrice(sanitisePounds(next))}
                        placeholder="0"
                        hint="Visits already recorded keep the price they were charged at."
                    />
                )}

                <TextField
                    label="Name"
                    required
                    value={name}
                    onChangeText={setName}
                    placeholder="Zirconia crown"
                    error={nameError}
                />

                {isCategory ? (
                    <Callout tone="note">
                        This one has subtypes under it, so it is a heading. The price and the rules belong to
                        each subtype.
                    </Callout>
                ) : (
                    <Select
                        label="Category"
                        options={[
                            { value: NO_CATEGORY, label: 'No category' },
                            ...categories.map((category) => ({
                                value: category.id,
                                label: category.name,
                            })),
                        ]}
                        value={parentId}
                        onChange={setParentId}
                        hint="A procedure inside a category is one of its subtypes, priced on its own."
                        sheetTitle="Category"
                    />
                )}
            </Card>

            {isCategory ? null : (
                <Card>
                    <FlagRow
                        label="Needs a tooth"
                        sub="The visit asks which tooth before this can be added."
                        value={toothSpecific}
                        onChange={setToothSpecific}
                    />
                    <CardDivider />
                    <FlagRow
                        label="Can have a quantity"
                        sub="Off means it can appear once per visit, per tooth."
                        value={hasQuantity}
                        onChange={setHasQuantity}
                    />
                    <CardDivider />
                    <FlagRow
                        label="This is the checkup"
                        sub="Added to every visit at check-in, and waived when any other work is done. Only one procedure can hold it."
                        value={isCheckup}
                        onChange={setIsCheckup}
                    />
                </Card>
            )}

            {procedure ? (
                <Card padded style={styles.form}>
                    <Text variant="subhead" tone="muted">
                        {procedure.active
                            ? 'Deactivating takes it out of the catalogue. Visits that already charged for it keep it, at the price they were charged.'
                            : 'This procedure is out of the catalogue. Reactivating puts it back.'}
                    </Text>
                    <Button
                        label={procedure.active ? 'Deactivate procedure' : 'Reactivate procedure'}
                        variant={procedure.active ? 'danger' : 'secondary'}
                        icon={
                            <PowerIcon
                                size={15}
                                stroke={procedure.active ? color.danger : color.ink}
                                width={2.2}
                            />
                        }
                        onPress={() => setConfirming(true)}
                        loading={setActive.pending}
                        block
                    />
                    <Text variant="caption" tone="muted" style={styles.dangerHint}>
                        Procedures are never deleted — past visits still reference them.
                    </Text>
                </Card>
            ) : null}

            <ConfirmSheet
                visible={confirming}
                title={procedure?.active ? 'Deactivate this procedure?' : 'Reactivate this procedure?'}
                body={
                    procedure?.active
                        ? 'It stops appearing when adding work to a visit. Nothing is deleted — past visits keep it and keep what they charged.'
                        : 'It appears in the catalogue again.'
                }
                confirmLabel={procedure?.active ? 'Deactivate' : 'Reactivate'}
                destructive={procedure?.active}
                loading={setActive.pending}
                onConfirm={onToggleActive}
                onCancel={() => setConfirming(false)}
            />
        </Pane>
    );
}

type FlagRowProps = {
    label: string;
    sub: string;
    value: boolean;
    onChange: (value: boolean) => void;
};

function FlagRow({ label, sub, value, onChange }: FlagRowProps) {
    return (
        <View style={styles.flagRow}>
            <View style={styles.rowText}>
                <Text variant="body" weight="medium">
                    {label}
                </Text>
                <Text variant="subhead" tone="muted">
                    {sub}
                </Text>
            </View>
            <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
        </View>
    );
}

const styles = StyleSheet.create({
    category: { gap: space[2] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[2],
        paddingHorizontal: space[4],
        paddingVertical: space[2],
    },
    pressed: { backgroundColor: color.surface2 },
    rowText: { flex: 1, gap: space[1] },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1.5] },
    dimmed: { opacity: 0.5 },
    note: { paddingHorizontal: space[1] },
    dangerHint: { textAlign: 'center' },
    fold: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1.5],
        minHeight: size.row,
        padding: space[3],
        borderRadius: radius.md,
    },
    form: { gap: space[4] },
    flagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        minHeight: size.row,
    },
});
