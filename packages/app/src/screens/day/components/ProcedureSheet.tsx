/**
 * The clinic's catalogue, one level deep (§5): a root either is the procedure
 * (Extraction) or is a heading whose children carry the prices (Composite
 * filling → Class I, Class II). Tapping a heading opens it in place rather than
 * pushing another sheet — the variant is a detail of the choice, not a second
 * question — and the price is on every row, because "how much is a zirconia
 * crown" is asked at the same moment as "add a crown".
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chevron, Sheet } from '../../../components/ui';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { ProcedureCategory, ProcedureRow, RequestError } from '../data';
import { describeError } from '../errors';
import { formatMoney } from '../money';

export type PickedProcedure = {
    procedureId: string;
    name: string;
    variant: string | null;
    price: number;
};

export type ProcedureSheetProps = {
    visible: boolean;
    onClose: () => void;
    onPick: (procedure: PickedProcedure) => void;
    categories: readonly ProcedureCategory[];
    loading: boolean;
    error: RequestError | null;
    onRetry: () => void;
    /** Named in the title so a tap on "Add to UL6" says where it is going. */
    tooth: string | null;
};

export function ProcedureSheet({
    visible,
    onClose,
    onPick,
    categories,
    loading,
    error,
    onRetry,
    tooth,
}: ProcedureSheetProps) {
    const [openId, setOpenId] = useState<string | null>(null);

    return (
        <Sheet
            visible={visible}
            onClose={onClose}
            title={tooth ? `Add to ${tooth}` : 'Add a procedure'}
            subtitle="Tap a category to choose a variant — most are picked directly."
            testID="procedure-sheet"
        >
            {loading ? (
                <Text variant="subhead" tone="muted">
                    Reading the catalogue…
                </Text>
            ) : error ? (
                <View style={styles.failure}>
                    <Text variant="subhead" tone="due">
                        {describeError(error).title}
                    </Text>
                    <Button label="Try again" variant="text" size="md" onPress={onRetry} />
                </View>
            ) : categories.length === 0 ? (
                <Text variant="subhead" tone="muted">
                    The clinic has no procedures set up yet. Settings → Procedures.
                </Text>
            ) : (
                <View style={styles.list}>
                    {categories.map((category) => {
                        const open = openId === category.id;

                        if (category.selectable) {
                            return (
                                <Row
                                    key={category.id}
                                    label={category.name}
                                    price={category.defaultPrice}
                                    onPress={() =>
                                        onPick({
                                            procedureId: category.id,
                                            name: category.name,
                                            variant: null,
                                            price: category.defaultPrice,
                                        })
                                    }
                                />
                            );
                        }

                        return (
                            <View key={category.id}>
                                <Row
                                    label={category.name}
                                    trailing={
                                        <Chevron
                                            direction={open ? 'up' : 'down'}
                                            size={9}
                                            tone={open ? 'ink' : 'muted'}
                                        />
                                    }
                                    open={open}
                                    onPress={() => setOpenId(open ? null : category.id)}
                                />

                                {open ? (
                                    <View style={styles.variants}>
                                        {category.children.map((child: ProcedureRow) => (
                                            <Pressable
                                                key={child.id}
                                                accessibilityRole="button"
                                                onPress={() =>
                                                    onPick({
                                                        procedureId: child.id,
                                                        name: category.name,
                                                        variant: child.name,
                                                        price: child.defaultPrice,
                                                    })
                                                }
                                                style={({ pressed }) => [
                                                    styles.variant,
                                                    pressed && styles.pressed,
                                                ]}
                                            >
                                                <Text variant="subhead" style={styles.grow}>
                                                    {child.name}
                                                </Text>
                                                <Text variant="subhead" weight="semibold">
                                                    {formatMoney(child.defaultPrice)}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                ) : null}
                            </View>
                        );
                    })}
                </View>
            )}
        </Sheet>
    );
}

function Row({
    label,
    price,
    trailing,
    open = false,
    onPress,
}: {
    label: string;
    price?: number;
    trailing?: React.ReactNode;
    open?: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [styles.row, open && styles.rowOpen, pressed && styles.pressed]}
        >
            <Text variant="body" weight="medium" style={styles.grow} numberOfLines={1}>
                {label}
            </Text>
            {price !== undefined ? (
                <Text variant="subhead" weight="semibold" tone="ink2">
                    {formatMoney(price)}
                </Text>
            ) : null}
            {trailing}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    list: { gap: space[0.5] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        minHeight: size.row,
        paddingHorizontal: space[3],
        paddingVertical: space[2.5],
        borderRadius: radius.lg,
        backgroundColor: color.surface,
    },
    rowOpen: { backgroundColor: color.surface2 },
    grow: { flex: 1 },
    variants: {
        gap: space[1.5],
        paddingStart: space[6],
        paddingEnd: space[3],
        paddingBottom: space[2],
        paddingTop: space[1],
        backgroundColor: color.surface2,
        borderBottomStartRadius: radius.lg,
        borderBottomEndRadius: radius.lg,
    },
    variant: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: 42,
        paddingHorizontal: space[3],
        borderRadius: radius.md,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    failure: { gap: space[2] },
    pressed: { opacity: 0.72 },
});
