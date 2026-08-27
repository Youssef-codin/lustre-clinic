/**
 * Settings → Procedures & prices. The catalogue is a self-referencing tree,
 * one level deep: a row with children is a category — a heading with no price
 * that never reaches a visit — and only leaves are chargeable, each priced on
 * its own (a variant is a leaf).
 *
 * The verb is hide, and hidden means gone from this screen — not dimmed, not
 * folded behind a toggle. Nothing is deleted: the row stays in the database and
 * on every visit that already charged for it, at the price it charged, so old
 * visits and receipts still resolve. The catalogue is just the live price list.
 *
 * The consequence, and it is deliberate: **hiding is one-way from the app.** A
 * hidden procedure has no row to tap, so there is no way back to it here. Only
 * the database remembers it. `settings-procedures.html` draws this as an
 * active/inactive pair with a "Show N inactive" fold; this screen is a
 * deliberate departure from that.
 *
 * The tree is still fetched whole, because parenthood must be computed over
 * hidden rows too — a category whose only subtype is hidden is still a category
 * and must not quietly become a priceable leaf. Only the rendering drops them.
 *
 * In reorder mode the price is dropped rather than sat beside the arrows — a
 * tappable price next to small buttons reprises by accident.
 *
 * ## Making a category
 *
 * A row is a category because something names it as a parent, which used to
 * mean no new one could ever be made: the Category picker only offered rows
 * that already had a child, so nothing could receive its first one. The ghost
 * "Category" button from `settings-procedures.html` is the way in, and it asks
 * for the first subtype in the same breath — a category and the procedure under
 * it are one write, `procedure.createCategory`, sent when the editor is saved.
 *
 * That is the answer to "what if you file nothing under it": you cannot make an
 * empty one. An empty category has no way to be a category — with no children
 * it is a root with a price, which `procedure.list` would happily offer on a
 * visit — so rather than write one and hope, nothing is written until there is
 * a subtype to write with it, and then both go in one transaction. A category that loses its last visible subtype
 * still draws here, as a heading with its "Add to" button and nothing under it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type RouterOutput, useTRPC } from '../../api';
import { MoneyValue } from '../../components/domain';
import { poundsToPiastres, sanitisePounds } from '../../components/domain/money';
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
    IconButton,
    NumericField,
    PushView,
    ReorderControls,
    SectionLabel,
    Select,
    Sheet,
    Switch,
    Tag,
    TextField,
    Toast,
    usePullToRefresh,
} from '../../components/ui';
import { color, radius, size, space, Text } from '../../theme';

import { CategoryIcon, EditIcon, HideIcon } from './components/icons';
import { Pane } from './components/Pane';
import { ErrorState, SkeletonRows } from './components/QueryStates';
import { errorText } from './data/errors';

export type ProcedureNode = RouterOutput['procedure']['tree'][number];
export type Procedure = ProcedureNode['children'][number];

export function ProceduresScreen({ onBack }: { onBack: () => void }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const tree = useQuery(trpc.procedure.tree.queryOptions({ includeInactive: true }));
    const [editing, setEditing] = useState<Procedure | 'new' | null>(null);
    const [addingTo, setAddingTo] = useState<ProcedureNode | null>(null);
    // A category being made: its name, held until the first subtype under it is
    // saved, because the two are written together.
    const [namingCategory, setNamingCategory] = useState(false);
    const [newCategory, setNewCategory] = useState<string | null>(null);
    const [reordering, setReordering] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const reorder = useMutation(
        trpc.procedure.reorder.mutationOptions({
            onSuccess: () => queryClient.invalidateQueries(trpc.procedure.pathFilter()),
        }),
    );

    // One write for the whole group, so a dropped connection leaves the order
    // it had rather than half of the new one.
    function move(siblings: readonly { id: string }[], index: number, delta: number) {
        const next = [...siblings];
        const moved = next[index];
        const target = next[index + delta];
        if (!moved || !target) return;
        next[index] = target;
        next[index + delta] = moved;
        reorder.mutate({ ids: next.map((row) => row.id) });
    }

    // The tree is fetched whole so parenthood — and therefore which rows are
    // categories — is computed over hidden rows too; a category whose only
    // subtype is hidden is still a category and must not become priceable.
    // Only the rendering drops them.
    const all = tree.data ?? [];

    function nextSortOrder(parentId: string | null): number {
        if (parentId === null) return all.length;
        return all.find((node) => node.id === parentId)?.children.length ?? 0;
    }

    const nodes = all
        .filter((node) => node.active)
        .map((node) => ({ ...node, children: node.children.filter((child) => child.active) }));

    const empty = nodes.length === 0;

    // Not while reordering: the rows are being dragged against the order this
    // would replace, and a price list that reshuffles under a finger is worse
    // than a stale one.
    const refreshControl = usePullToRefresh(() => {
        if (!reordering) void tree.refetch();
    }, tree.isFetching);

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
                {tree.isLoading ? <SkeletonRows count={4} trailing /> : null}

                {tree.error ? (
                    <ErrorState
                        message={errorText(tree.error)}
                        onRetry={tree.refetch}
                        retrying={tree.isFetching}
                    />
                ) : null}

                {reorder.error ? (
                    <Callout tone="warning" title="Order not saved">
                        {errorText(reorder.error)}
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
                                reorderDisabled={reorder.isPending}
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
                                        <IconButton
                                            accessibilityLabel={`Rename ${node.name}`}
                                            variant="bare"
                                            icon={<EditIcon size={15} />}
                                            onPress={() => setEditing(node)}
                                            testID={`category-rename-${node.id}`}
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
                                            reorderDisabled={reorder.isPending}
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
                                        {node.children.length > 0 ? <CardDivider /> : null}
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
                    <View style={styles.addRow}>
                        <View style={styles.addProcedure}>
                            <AddButton
                                label="Add a procedure"
                                onPress={() => setEditing('new')}
                                testID="procedure-add"
                            />
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Add a category"
                            onPress={() => setNamingCategory(true)}
                            testID="category-add"
                            style={({ pressed }) => [styles.addCategory, pressed && styles.pressed]}
                        >
                            <CategoryIcon />
                            <Text variant="callout" weight="medium" tone="muted">
                                Category
                            </Text>
                        </Pressable>
                    </View>
                ) : null}

                {tree.data && !empty ? (
                    <Text variant="footnote" tone="muted" style={styles.note}>
                        A procedure with subtypes is a heading — only the subtypes under it can go on a visit,
                        and each has its own price.
                    </Text>
                ) : null}

                {namingCategory ? (
                    <CategorySheet
                        onClose={() => setNamingCategory(false)}
                        onNamed={(name) => {
                            setNamingCategory(false);
                            setNewCategory(name);
                        }}
                    />
                ) : null}
            </Pane>

            <PushView visible={editing !== null || addingTo !== null || newCategory !== null}>
                {editing !== null || addingTo !== null || newCategory !== null ? (
                    <ProcedureEditor
                        procedure={editing !== null && editing !== 'new' ? editing : null}
                        parent={addingTo}
                        newCategory={newCategory}
                        categories={all.filter((node) => !node.selectable)}
                        nextSortOrder={nextSortOrder}
                        onClose={() => {
                            setEditing(null);
                            setAddingTo(null);
                            setNewCategory(null);
                        }}
                        onSaved={(message) => {
                            setEditing(null);
                            setAddingTo(null);
                            setNewCategory(null);
                            setToast(message);
                        }}
                    />
                ) : null}
            </PushView>
        </>
    );
}

/**
 * `catSheet` from the mockup, minus its Arabic name field: `procedure_types`
 * has one `name` column, and giving the catalogue a second one is a migration
 * of its own (the same one the patient questions are waiting on). Deferred by
 * the user's decision, so this asks in English and says so nowhere, because a
 * disabled field nobody can fill is worse than a field that is not there.
 *
 * Naming is where the sheet stops. Nothing is written until the editor behind
 * it saves the first subtype — see the note at the top of the file.
 */
function CategorySheet({ onClose, onNamed }: { onClose: () => void; onNamed: (name: string) => void }) {
    const [name, setName] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const error = submitted && name.trim() === '' ? 'A category needs a name.' : undefined;

    function onNext() {
        setSubmitted(true);
        if (name.trim() === '') return;
        onNamed(name.trim());
    }

    return (
        <Sheet
            visible
            onClose={onClose}
            title="New category"
            subtitle="A category groups procedures. It has no price of its own and can't be picked on a visit."
            testID="category-sheet"
            footer={
                <View style={styles.sheetActions}>
                    <View style={styles.sheetCancel}>
                        <Button label="Cancel" variant="ghost" onPress={onClose} block />
                    </View>
                    <View style={styles.sheetConfirm}>
                        <Button label="Next" onPress={onNext} block testID="category-next" />
                    </View>
                </View>
            }
        >
            <TextField
                value={name}
                onChangeText={setName}
                placeholder="Crowns"
                accessibilityLabel="Category name"
                autoCapitalize="words"
                error={error}
                hint="The next screen asks for the first procedure under it."
                testID="category-name"
            />
        </Sheet>
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
        <View style={styles.rowText}>
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
            <MoneyValue piastres={procedure.defaultPrice} />
            <Chevron direction="forward" tone="muted" />
        </Pressable>
    );
}

type ProcedureEditorProps = {
    procedure: Procedure | null;
    parent: ProcedureNode | null;
    /** The name of a category being made with this procedure as its first subtype. */
    newCategory: string | null;
    categories: ProcedureNode[];
    /** Where a new row lands in its group: after everything already in it. */
    nextSortOrder: (parentId: string | null) => number;
    onClose: () => void;
    onSaved: (message: string) => void;
};

const NO_CATEGORY = 'none';

function ProcedureEditor({
    procedure,
    parent,
    newCategory,
    categories,
    nextSortOrder,
    onClose,
    onSaved,
}: ProcedureEditorProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const onProcedureWritten = () => queryClient.invalidateQueries(trpc.procedure.pathFilter());

    const [name, setName] = useState(procedure?.name ?? '');
    const [price, setPrice] = useState(procedure ? String(Math.round(procedure.defaultPrice / 100)) : '');
    const [parentId, setParentId] = useState<string>(procedure?.parentId ?? parent?.id ?? NO_CATEGORY);
    const [toothSpecific, setToothSpecific] = useState(procedure?.isToothSpecific ?? false);
    const [hasQuantity, setHasQuantity] = useState(procedure?.hasQuantity ?? false);
    const [isCheckup, setIsCheckup] = useState(procedure?.isCheckup ?? false);
    const [submitted, setSubmitted] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const isCategory = categories.some((category) => category.id === procedure?.id);
    /** The category is fixed when it is being made here, or when adding under one. */
    const fixedParent = newCategory ?? parent?.name ?? null;

    const create = useMutation(trpc.procedure.create.mutationOptions({ onSuccess: onProcedureWritten }));
    const createCategory = useMutation(
        trpc.procedure.createCategory.mutationOptions({ onSuccess: onProcedureWritten }),
    );
    const update = useMutation(trpc.procedure.update.mutationOptions({ onSuccess: onProcedureWritten }));

    const nameError = submitted && name.trim() === '' ? 'A procedure needs a name.' : undefined;
    const saving = create.isPending || createCategory.isPending || (update.isPending && !confirming);
    const busy = create.isPending || createCategory.isPending || update.isPending;
    const failure = create.error ?? createCategory.error ?? update.error;

    function onSave() {
        setSubmitted(true);
        if (name.trim() === '') return;

        const chosenParent = parentId === NO_CATEGORY ? null : parentId;
        const details = {
            parentId: chosenParent,
            name: name.trim(),
            defaultPrice: poundsToPiastres(price),
            hasQuantity,
            isToothSpecific: toothSpecific,
            isCheckup,
        };

        if (procedure) {
            update.mutate({ id: procedure.id, ...details }, { onSuccess: () => onSaved('Procedure saved') });
            return;
        }

        // The category and this subtype are one write, because a category with
        // nothing under it is a priceable root — see the note at the top of the
        // file. Two calls would leave one behind whenever the second failed.
        if (newCategory !== null) {
            createCategory.mutate(
                {
                    name: newCategory,
                    sortOrder: nextSortOrder(null),
                    first: {
                        name: details.name,
                        defaultPrice: details.defaultPrice,
                        hasQuantity: details.hasQuantity,
                        isToothSpecific: details.isToothSpecific,
                        isCheckup: details.isCheckup,
                    },
                },
                { onSuccess: () => onSaved(`${newCategory} added`) },
            );
            return;
        }

        create.mutate(
            { ...details, sortOrder: nextSortOrder(chosenParent) },
            { onSuccess: () => onSaved('Procedure added') },
        );
    }

    // One-way: `active` is still the column, because the server and every
    // history query already read it. Only the app's language and the way out
    // have changed.
    function onHide() {
        if (!procedure) return;
        update.mutate(
            { id: procedure.id, active: false },
            {
                onSuccess: () => {
                    setConfirming(false);
                    onSaved('Procedure hidden');
                },
            },
        );
    }

    return (
        <Pane
            title={procedure ? 'Edit procedure' : 'New procedure'}
            subtitle={!procedure && fixedParent ? `Under ${fixedParent}` : undefined}
            onBack={busy ? () => {} : onClose}
            footer={
                // Save alone, as the mockup draws it: the pane has a back
                // button, and a Cancel beside Save on a screen reached by a row
                // tap is a second way to do what backing out already does.
                <ActionBar
                    primaryLabel={saving ? 'Saving' : 'Save'}
                    onPrimary={onSave}
                    primaryLoading={saving}
                    primaryDisabled={busy}
                />
            }
        >
            {failure ? (
                <Callout tone="warning" title="Not saved">
                    {errorText(failure)}
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
                ) : newCategory !== null ? (
                    <Callout tone="note">
                        {`Saving this makes “${newCategory}” a category with this as its first subtype. A category has no price of its own.`}
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
                        Hiding takes it out of the catalogue and off this screen. Visits that already charged
                        for it keep it, at the price they were charged.
                    </Text>
                    <Button
                        label="Hide procedure"
                        variant="danger"
                        icon={<HideIcon size={15} stroke={color.danger} width={2.2} />}
                        onPress={() => setConfirming(true)}
                        loading={update.isPending && confirming}
                        block
                    />
                    <Text variant="caption" tone="muted" style={styles.dangerHint}>
                        Procedures are never deleted — past visits still reference them.
                    </Text>
                </Card>
            ) : null}

            {/* Spelled out because it cannot be undone from the app: once the
                row leaves the list there is nothing left to tap. */}
            <ConfirmSheet
                visible={confirming}
                title="Hide this procedure?"
                body="It stops appearing when adding work to a visit, and comes off this screen for good — you won't be able to bring it back from here. Nothing is deleted: past visits keep it and keep what they charged."
                confirmLabel="Hide"
                destructive
                loading={update.isPending && confirming}
                onConfirm={onHide}
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
    addRow: { flexDirection: 'row', alignItems: 'stretch', gap: space[2.5] },
    addProcedure: { flex: 1 },
    // The mockup's ghost twin of `AddButton`: same shape, muted rather than
    // accented, sized to its own label. `ui/AddButton` draws one weight only.
    addCategory: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        minHeight: size.row,
        paddingHorizontal: space[3.5],
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: color.outline,
    },
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
    note: { paddingHorizontal: space[1] },
    dangerHint: { textAlign: 'center' },
    form: { gap: space[4] },
    sheetActions: { flexDirection: 'row', gap: space[2] },
    sheetCancel: { flex: 1 },
    sheetConfirm: { flex: 1.4 },
    flagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        minHeight: size.row,
    },
});
