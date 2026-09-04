import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { color, radius, shadow, space, Text } from '../../theme';
import { Button } from './Button';

export type EmptyStateProps = {
    title: string;
    body?: string;
    /**
     * Glyph inside the ring or tile. Omit it for the default `+` — the empty
     * state is an invitation and the screen has no other round `+` to be
     * confused with. Pass `null` for a state that is a statement rather than an
     * offer: the ring goes with it, because a ring drawn around nothing to press
     * is the affordance without the action.
     */
    icon?: ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    /**
     * `ring` — a circle and a pill CTA, for a screen that is empty *right now*
     * `panel` — a dashed panel and a full-width CTA, for a list that is empty
     *   because nothing has been set up yet
     * `line` — one muted sentence, for an empty section inside a full screen
     */
    weight?: 'ring' | 'panel' | 'line';
};

export function EmptyState({ title, body, icon, actionLabel, onAction, weight = 'ring' }: EmptyStateProps) {
    if (weight === 'line') {
        return (
            <View style={styles.line}>
                <Text variant="subhead" tone="muted">
                    {title}
                </Text>
            </View>
        );
    }

    const panel = weight === 'panel';
    const glyph =
        icon === undefined ? (
            <Text variant="title3" tone="muted">
                {'+'}
            </Text>
        ) : (
            icon
        );

    return (
        <View style={[styles.state, panel && styles.panel]}>
            {glyph === null ? null : (
                <View style={[styles.glyph, panel ? styles.tile : styles.ring]}>{glyph}</View>
            )}

            <Text variant="headline">{title}</Text>
            {body ? (
                <Text variant="subhead" tone="muted" style={styles.body}>
                    {body}
                </Text>
            ) : null}

            {actionLabel ? (
                <Button
                    label={actionLabel}
                    onPress={onAction}
                    variant={panel ? 'primary' : 'ghost'}
                    size={panel ? 'lg' : 'md'}
                    block={panel}
                    style={panel ? undefined : styles.action}
                />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    state: { alignSelf: 'stretch', alignItems: 'center', gap: space[2], paddingVertical: space[8] },
    panel: {
        paddingVertical: space[6],
        paddingHorizontal: space[5],
        borderRadius: radius.xl2,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: color.line,
        backgroundColor: color.canvas,
    },
    glyph: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: space[1] },
    // The same fill, hairline and shadow the ghost button carries — the glyph
    // reads as the thing you press rather than a drawn outline.
    ring: {
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
        boxShadow: shadow.pill,
    },
    tile: { borderRadius: radius.xl, backgroundColor: color.surface2 },
    body: { textAlign: 'center' },
    action: { alignSelf: 'center', marginTop: space[2] },
    line: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: space[6] },
});
