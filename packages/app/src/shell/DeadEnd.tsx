import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { color, radius, space, Text } from '../theme';

/**
 * The card the shell's dead-end routes stand on — offline, and refused by the
 * server: a glyph, what happened, what to do, and the one or two ways out
 * below. Title and body arrive already localized.
 */
export function DeadEnd({
    glyph,
    title,
    body,
    children,
}: {
    glyph: ReactNode;
    title: string;
    body: string;
    children: ReactNode;
}) {
    return (
        <View style={styles.root}>
            <View style={styles.card}>
                <View style={styles.glyph}>{glyph}</View>
                <Text variant="title3">{title}</Text>
                <Text variant="subhead" tone="muted" style={styles.body}>
                    {body}
                </Text>
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: color.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space[5],
    },
    card: {
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space[8],
        paddingHorizontal: space[5],
        borderRadius: radius.xl2,
        backgroundColor: color.surface,
    },
    glyph: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: space[1],
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: color.line,
    },
    body: { textAlign: 'center' },
});
