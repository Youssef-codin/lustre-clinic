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
} from '../../components/ui';
import { color, size, space, Text } from '../../theme';
import { _LocalMoneyValue, poundsToPiastres } from './components/_LocalMoneyValue';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { api } from './data/_LocalApi';
import { errorMessage, useMutation, useQuery } from './data/hooks';
import type { Procedure, ProcedureNode } from './data/types';

/**
 * Settings → Procedures and prices (SPEC §5, §12).
 *
 * The catalogue is a self-referencing tree, one level deep. A row with children
 * is a **category** and is not selectable — it is a heading, so it has no price
 * and never reaches a visit. Only leaves are chargeable, and each carries its
 * own price: Crown → Zirconia / E.max, Composite → Class I–IV. There is no
 * separate variant concept; a variant is a leaf, which is what §7.4 resolves.
 *
 * Nothing is ever deleted (§7.8). A procedure is deactivated: it stops
 * appearing in the catalogue picker and stays on every visit that already
 * charged for it, at the price it was charged at (`visit_procedures.unit_price`
 * is a snapshot, §5). Editing a price is forward-only for the same reason.
 */
export function ProceduresScreen({ onBack }: { onBack: () => void }) {
    // Inactive rows are shown here, dimmed — this is the one screen where a
    // deactivated procedure has to be findable, because it is where it is
    // brought back.
    const tree = useQuery(useCallback(() => api.procedure.tree(true), []));
    const [editing, setEditing] = useState<Procedure | 'new' | null>(null);
    const [addingTo, setAddingTo] = useState<ProcedureNode | null>(null);
    const [reordering, setReordering] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

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

    const nodes = tree.data ?? [];
    const empty = nodes.length === 0;

    return (
        <>
            <Pane
                title="Procedures and prices"
                onBack={reordering ? () => setReordering(false) : onBack}
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
                                onPress={() => setEditing(node)}
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
                                            onPress={() => setEditing(node)}
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
                                            onPress={() => setEditing(child)}
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
                        categories={nodes.filter((node) => !node.selectable)}
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

/**
 * Name, its flags, and a price. In reorder mode the price is replaced rather
 * than sat beside the arrows — the design freezes it deliberately, because a
 * tappable price next to a pair of small buttons is a way to reprice a
 * procedure by accident.
 */
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
    /** Set when the row is being added under a category from its card footer. */
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

    // A row that already has children is a category: it is a heading, so its
    // price and flags are not editable and the form says why.
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
                <ActionBar
                    primaryLabel={save.pending ? 'Saving' : 'Save'}
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
                    placeholder="Zirconia crown"
                    error={nameError}
                />

                {isCategory ? (
                    <Callout tone="note">
                        This one has subtypes under it, so it is a heading. The price and the rules belong to
                        each subtype.
                    </Callout>
                ) : (
                    <>
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

                        <NumericField
                            label="Price"
                            variant="display"
                            prefix="EGP"
                            value={price}
                            onChangeText={setPrice}
                            placeholder="0"
                            hint="Visits already recorded keep the price they were charged at."
                        />
                    </>
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
                        onPress={() => setConfirming(true)}
                        loading={setActive.pending}
                        block
                    />
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
