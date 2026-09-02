/**
 * What is going to be done, grouped by tooth — the same shape the visit screen
 * records afterwards, because a booking of "UL6 filling, plus a scaling" and
 * the visit that carries it out are the same list at two moments, and a
 * secretary who learns one has learned the other.
 *
 * Adding asks the tooth first and the procedure second. That order looks
 * backwards until you watch it used: the tooth is what the patient says on the
 * phone ("the back one on the top left hurts"), and the catalogue is long, so
 * choosing the tooth first turns the second question into "what are we doing to
 * *this*". A group's own "Add to UL6" skips the first question entirely, which
 * is the common case once a tooth is on screen.
 *
 * Prices are the clinic's, editable in place: a quoted price is a promise made
 * at the desk, and the catalogue's default is only where it starts. Whole
 * pounds in, integer piastres held (§7.12).
 */

import type { Tooth } from '@lustre/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MoneyValue, ToothGroupCard } from '../../../components/domain';
import { poundsToPiastres, toPounds } from '../../../components/domain/money';
import { duration } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { ProcedureCategory, RequestError } from '../data';
import { groupByTooth, type PlannedProcedure, toothPosition, totalOf } from '../procedures';
import { PlusIcon, XIcon } from './icons';
import { type PickedProcedure, ProcedureSheet } from './ProcedureSheet';
import { ToothSheet } from './ToothSheet';

export type ProcedurePlanProps = {
    value: readonly PlannedProcedure[];
    onChange: (next: PlannedProcedure[]) => void;
    categories: readonly ProcedureCategory[];
    loading: boolean;
    error: RequestError | null;
    onRetry: () => void;
};

/**
 * Which question is open: the tooth, the catalogue, or neither — plus the tooth
 * asked the other way round, after a pick from the general sheet that turned
 * out to need one.
 */
type Asking =
    | null
    | { step: 'tooth' }
    | { step: 'procedure'; tooth: Tooth | null }
    | { step: 'toothFor'; picked: PickedProcedure };

export function ProcedurePlan({ value, onChange, categories, loading, error, onRetry }: ProcedurePlanProps) {
    const [asking, setAsking] = useState<Asking>(null);
    const [collapsed, setCollapsed] = useState<readonly string[]>([]);

    const groups = groupByTooth(value);
    const total = totalOf(value);

    /**
     * Both questions are `Modal`s, and presenting one while another is still
     * dismissing is how iOS silently drops the second — so the catalogue waits
     * out the tooth sheet's exit rather than racing it.
     */
    function askProcedure(tooth: Tooth | null, afterSheet: boolean) {
        if (!afterSheet) {
            setAsking({ step: 'procedure', tooth });
            return;
        }
        setAsking(null);
        setTimeout(() => setAsking({ step: 'procedure', tooth }), duration.sheet);
    }

    /**
     * The general sheet offers the whole catalogue, so a pick can arrive owing
     * a tooth. Ask for it before the line exists rather than after — a line
     * with no tooth is one §5 refuses at confirm, with the plan already built.
     */
    function pick(tooth: Tooth | null, picked: PickedProcedure) {
        if (tooth === null && picked.needsTooth) {
            setAsking(null);
            setTimeout(() => setAsking({ step: 'toothFor', picked }), duration.sheet);
            return;
        }
        add(tooth, picked);
    }

    function add(tooth: Tooth | null, picked: PickedProcedure) {
        onChange([
            ...value,
            {
                id: `plan-${Date.now()}-${value.length}`,
                procedureId: picked.procedureId,
                name: picked.name,
                variant: picked.variant,
                tooth,
                price: picked.price,
            },
        ]);
        setAsking(null);
    }

    function remove(id: string) {
        onChange(value.filter((row) => row.id !== id));
    }

    function reprice(id: string, entry: string) {
        const price = poundsToPiastres(entry);
        onChange(value.map((row) => (row.id === id ? { ...row, price } : row)));
    }

    function toggle(key: string) {
        setCollapsed((current) =>
            current.includes(key) ? current.filter((row) => row !== key) : [...current, key],
        );
    }

    return (
        <View style={styles.plan}>
            <View style={styles.head}>
                <Text variant="eyebrow" tone="muted">
                    WHAT IS PLANNED
                </Text>
                <Text variant="caption" tone="muted">
                    {value.length === 0
                        ? 'Optional'
                        : `${value.length} procedure${value.length === 1 ? '' : 's'}`}
                </Text>
            </View>

            {value.length === 0 ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={() => setAsking({ step: 'tooth' })}
                    style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
                    testID="plan-empty-add"
                >
                    <View style={styles.ring}>
                        <PlusIcon size={20} stroke={color.ink} />
                    </View>
                    <Text variant="headline">Nothing planned yet</Text>
                    <Text variant="subhead" tone="muted" style={styles.emptyBody}>
                        Add what the visit is for — a tooth, then the procedure. It can be left empty and
                        decided in the chair.
                    </Text>
                </Pressable>
            ) : (
                <View style={styles.groups}>
                    {groups.map((group) => {
                        const key = group.tooth ?? 'none';
                        const open = !collapsed.includes(key);

                        return (
                            <ToothGroupCard
                                key={key}
                                tooth={group.tooth}
                                position={toothPosition(group.tooth)}
                                expanded={open}
                                onToggle={() => toggle(key)}
                                subtotal={
                                    <MoneyValue
                                        piastres={group.subtotal}
                                        variant="subhead"
                                        weight="semibold"
                                    />
                                }
                                lines={group.items.map((item) => ({
                                    id: item.id,
                                    name: item.name,
                                    detail: item.variant,
                                    // A field, not a figure: this is the plan being
                                    // priced, and the price is what the doctor is
                                    // here to change.
                                    money: (
                                        <>
                                            <Text variant="caption" tone="muted">
                                                EGP
                                            </Text>
                                            <TextInput
                                                value={String(toPounds(item.price))}
                                                onChangeText={(entry) => reprice(item.id, entry)}
                                                keyboardType="number-pad"
                                                accessibilityLabel={`Price for ${item.name}`}
                                                style={styles.price}
                                            />
                                        </>
                                    ),
                                    trailing: (
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel={`Remove ${item.name}`}
                                            hitSlop={8}
                                            onPress={() => remove(item.id)}
                                            style={({ pressed }) => [
                                                styles.kill,
                                                pressed && styles.killPressed,
                                            ]}
                                        >
                                            <XIcon size={14} stroke={color.muted} />
                                        </Pressable>
                                    ),
                                }))}
                                footer={
                                    group.tooth ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => askProcedure(group.tooth, false)}
                                            style={({ pressed }) => [
                                                styles.groupAdd,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <PlusIcon size={13} stroke={color.ink2} />
                                            <Text variant="caption" weight="semibold" tone="ink2">
                                                Add to {group.tooth}
                                            </Text>
                                        </Pressable>
                                    ) : null
                                }
                            />
                        );
                    })}

                    <Pressable
                        accessibilityRole="button"
                        onPress={() => setAsking({ step: 'tooth' })}
                        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
                        testID="plan-add"
                    >
                        <View style={styles.addGlyph}>
                            <PlusIcon size={13} stroke={color.inverse} />
                        </View>
                        <Text variant="subhead" weight="semibold" tone="ink2">
                            Add procedure
                        </Text>
                    </Pressable>

                    <View style={styles.total}>
                        <Text variant="subhead" tone="muted">
                            Estimated total
                        </Text>
                        <MoneyValue piastres={total} variant="title3" weight="semibold" />
                    </View>
                </View>
            )}

            <ToothSheet
                visible={asking?.step === 'tooth' || asking?.step === 'toothFor'}
                // The variant is what was tapped; the category alone reads as
                // "Surgical is done to a tooth", which names nothing.
                required={
                    asking?.step === 'toothFor' ? (asking.picked.variant ?? asking.picked.name) : undefined
                }
                onClose={() => setAsking(null)}
                onPick={(tooth) => {
                    if (asking?.step === 'toothFor') {
                        add(tooth, asking.picked);
                        return;
                    }
                    askProcedure(tooth, true);
                }}
            />

            <ProcedureSheet
                visible={asking?.step === 'procedure'}
                onClose={() => setAsking(null)}
                onPick={(picked) => pick(asking?.step === 'procedure' ? asking.tooth : null, picked)}
                categories={categories}
                loading={loading}
                error={error}
                onRetry={onRetry}
                tooth={asking?.step === 'procedure' ? asking.tooth : null}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    plan: { gap: space[2.5] },
    head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    grow: { flex: 1, minWidth: 0 },

    empty: {
        alignItems: 'center',
        gap: space[1.5],
        paddingVertical: space[7],
        paddingHorizontal: space[5],
        borderRadius: radius.xl,
        borderWidth: border.hair,
        borderStyle: 'dashed',
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    ring: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: color.surface2,
        marginBottom: space[1],
    },
    emptyBody: { textAlign: 'center' },

    groups: { gap: space[3] },
    price: {
        minWidth: 62,
        paddingVertical: space[1],
        textAlign: 'right',
        fontSize: 15,
        fontWeight: '700',
        color: color.ink,
    },
    kill: {
        width: 26,
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
    },
    killPressed: { backgroundColor: color.dangerSoft },

    groupAdd: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: 42,
        paddingHorizontal: space[3.5],
        borderTopWidth: border.hair,
        borderTopColor: color.line,
        borderStyle: 'dashed',
    },

    add: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        minHeight: size.row,
        paddingHorizontal: space[3.5],
        borderRadius: radius.lg,
        borderWidth: border.hair,
        borderStyle: 'dashed',
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    addGlyph: {
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: color.ink,
    },

    total: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: space[3.5],
        borderRadius: radius.lg,
        backgroundColor: color.canvas,
    },
    pressed: { opacity: 0.72 },
});
