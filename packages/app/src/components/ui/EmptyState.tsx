import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { color, radius, space, Text } from '../../theme';
import { Button } from './Button';

export type EmptyStateProps = {
    title: string;
    body?: string;
    icon?: ReactNode;
    actionLabel?: string;
    onAction?: () => void;
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

    return (
        <View style={[styles.state, panel && styles.panel]}>
            <View style={[styles.glyph, panel ? styles.tile : styles.ring]}>
                {icon ?? (
                    <Text variant="title3" tone="muted">
                        {'+'}
                    </Text>
                )}
            </View>

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
    ring: { borderRadius: radius.full, borderWidth: 1, borderColor: color.line },
    tile: { borderRadius: radius.xl, backgroundColor: color.surface2 },
    body: { textAlign: 'center' },
    action: { alignSelf: 'center', marginTop: space[2] },
    line: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: space[6] },
});
