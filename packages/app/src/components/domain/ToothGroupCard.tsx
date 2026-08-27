/**
 * One tooth and the work planned on it (Component Inventory §5). The same block
 * — badge, position, lines — is what the doctor's visit sheet, the booking
 * screen and the procedure plan each drew for themselves.
 *
 * Grouping is by tooth because that is how the work is spoken about at the desk
 * and in the chair: "UL6 needs a filling and a cleaning" is one tooth with two
 * lines. The grouping itself is already shared (`toothGroupsOf`); this is the
 * markup that was not.
 *
 * `position` is passed in rather than derived here. The caller already has it,
 * and deriving it a second time would put the quadrant words in two places —
 * which is the duplication this component exists to end, not to move.
 *
 * `variant` is the two arrangements the screens actually draw:
 *
 * - `card` — a bordered box per tooth, with the badge, the position and the
 *   subtotal on a head row and the lines beneath it. A plan being built, where
 *   each tooth is a thing to open, price and add to.
 * - `row` — no border, badge on the start edge, the lines and the position
 *   stacked beside it. For a read where the teeth share one card: a booking is
 *   usually a single line, and a bordered box with a head row, a divider and one
 *   name in it is mostly chrome.
 *
 * No money is formatted here. `money` and `subtotal` are slots — a `MoneyValue`,
 * a price input, or nothing at all, which is what a booking has: it carries the
 * plan that was agreed, not a bill (§7).
 */
import type { Tooth } from '@lustre/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { border, color, radius, space, Text } from '../../theme';
import { Chevron } from '../ui';

export type ToothGroupLine = {
    id: string;
    name: string;
    /** The variant or note under the name — "Class II". */
    detail?: string | null;
    /** This line's money, drawn on the end edge. A value, an input, or nothing. */
    money?: ReactNode;
    /** Whatever ends the line: a remove control, a chevron. */
    trailing?: ReactNode;
};

export type ToothGroupCardProps = {
    tooth: Tooth | null;
    /** "Upper left · 6" — spelled out, because `UL6` and `UR6` are one letter apart and opposite sides of the mouth. */
    position: string;
    lines: readonly ToothGroupLine[];
    variant?: 'card' | 'row';
    /** The group's money, on the head row. `card` only — `row` has no head to hang it on. */
    subtotal?: ReactNode;
    /** Given together, the head becomes a button and the lines collapse. `card` only. */
    expanded?: boolean;
    onToggle?: () => void;
    /** Under the last line — the group's own "Add to UL6". */
    footer?: ReactNode;
    testID?: string;
};

export function ToothGroupCard({
    tooth,
    position,
    lines,
    variant = 'card',
    subtotal,
    expanded = true,
    onToggle,
    footer,
    testID,
}: ToothGroupCardProps) {
    if (variant === 'row') {
        return (
            <View style={styles.row} testID={testID}>
                <ToothBadge tooth={tooth} variant="row" />
                <View style={styles.rowBody}>
                    {lines.map((line) => (
                        <Line key={line.id} line={line} stacked />
                    ))}
                    <Text variant="footnote" tone="muted">
                        {position}
                    </Text>
                </View>
            </View>
        );
    }

    const head = (
        <>
            <ToothBadge tooth={tooth} variant="card" />
            <Text variant="subhead" tone="muted" numberOfLines={1} style={styles.grow}>
                {position}
            </Text>
            {subtotal}
            {onToggle ? <Chevron direction={expanded ? 'up' : 'down'} size={9} /> : null}
        </>
    );

    return (
        <View style={styles.card} testID={testID}>
            {onToggle ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${position}, ${lines.length} procedures`}
                    onPress={onToggle}
                    style={({ pressed }) => [styles.head, pressed && styles.pressed]}
                >
                    {head}
                </Pressable>
            ) : (
                <View style={styles.head}>{head}</View>
            )}

            {expanded ? (
                <View>
                    {lines.map((line) => (
                        <Line key={line.id} line={line} />
                    ))}
                    {footer}
                </View>
            ) : null}
        </View>
    );
}

/**
 * The tooth code itself. A tooth-less group is the mouth rather than a number —
 * a scaling belongs to no tooth — and is drawn as an empty slot, dashed, so it
 * reads as "nothing here" and not as a code that failed to load.
 */
function ToothBadge({ tooth, variant }: { tooth: Tooth | null; variant: 'card' | 'row' }) {
    return (
        <View
            style={[
                styles.badge,
                variant === 'card' ? styles.badgeCard : styles.badgeRow,
                !tooth && styles.badgeNone,
            ]}
        >
            <Text variant="footnote" script="sans" weight="bold" tone={tooth ? 'ink' : 'muted'}>
                {tooth ?? '—'}
            </Text>
        </View>
    );
}

function Line({ line, stacked = false }: { line: ToothGroupLine; stacked?: boolean }) {
    return (
        <View style={stacked ? styles.stackedLine : styles.line}>
            <View style={styles.grow}>
                <Text variant="body" weight="semibold" numberOfLines={stacked ? undefined : 1}>
                    {line.name}
                </Text>
                {line.detail ? (
                    <Text variant="caption" tone="muted">
                        {line.detail}
                    </Text>
                ) : null}
            </View>
            {line.money}
            {line.trailing}
        </View>
    );
}

const styles = StyleSheet.create({
    grow: { flex: 1, minWidth: 0 },

    card: {
        borderRadius: radius.xl,
        borderWidth: border.hair,
        borderColor: color.line,
        backgroundColor: color.surface,
        overflow: 'hidden',
    },
    head: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        minHeight: 54,
        paddingHorizontal: space[3],
    },
    pressed: { opacity: 0.72 },

    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        paddingHorizontal: space[3.5],
        paddingVertical: space[3],
    },
    rowBody: { flex: 1, gap: space[0.5], paddingTop: space[0.5] },

    badge: {
        minWidth: 46,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[1.5],
        borderWidth: border.hair,
        borderColor: color.line,
    },
    // The two the screens draw. A card's head is 54 tall and carries a badge to
    // match; a row's badge sits against stacked text and is the smaller of the
    // two, on the tint that separates it from the card it shares.
    badgeCard: { height: 37, borderRadius: radius.md, backgroundColor: color.surface },
    badgeRow: { height: 32, borderRadius: radius.sm, backgroundColor: color.surface2 },
    badgeNone: { backgroundColor: color.surface, borderStyle: 'dashed' },

    line: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingStart: space[3.5],
        paddingEnd: space[2.5],
        paddingVertical: space[2],
        borderTopWidth: border.hair,
        borderTopColor: color.hair,
    },
    stackedLine: { gap: space[0.5] },
});
