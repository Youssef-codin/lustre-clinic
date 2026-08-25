/**
 * A label, a control, and whatever has to be said under it.
 *
 * `layout` is where the label sits, not what the control looks like. `stacked`
 * is a form being filled in: label above, control below, full width. `inline`
 * is a card being corrected — label on the start edge, control on the end edge,
 * one row — which is how the designs draw a "what is on file" card, where the
 * screen is a record with a few things to fix rather than a page of empty
 * boxes. A stacked label above a 48px box turns eight known facts into a form.
 *
 * `TextField`'s own `inline` is a different axis: that one is the underlined
 * control against the boxed one, and either layout can carry either control.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, Text } from '../../theme';

export type FieldLayout = 'stacked' | 'inline';

export type FieldProps = {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    layout?: FieldLayout;
    children: ReactNode;
};

export function Field({ label, required = false, hint, error, layout = 'stacked', children }: FieldProps) {
    const labelBlock = label ? (
        <View style={styles.labelRow}>
            <Text variant="subhead" weight="medium" tone={error ? 'danger' : 'ink2'}>
                {label}
            </Text>
            {required ? (
                <Text variant="subhead" tone="danger">
                    *
                </Text>
            ) : null}
        </View>
    ) : null;

    const footer =
        error || hint ? (
            <Text variant="footnote" tone={error ? 'danger' : 'muted'}>
                {error ?? hint}
            </Text>
        ) : null;

    if (layout === 'inline') {
        return (
            <View style={styles.field}>
                <View style={styles.row}>
                    {labelBlock}
                    <View style={styles.control}>{children}</View>
                </View>
                {footer}
            </View>
        );
    }

    return (
        <View style={styles.field}>
            {labelBlock}
            {children}
            {footer}
        </View>
    );
}

const styles = StyleSheet.create({
    field: { alignSelf: 'stretch', gap: space[1.5] },
    // `flexShrink` because React Native defaults it to 0, not to the web's 1:
    // without it a long inline label pushes its control off the end edge.
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[0.5], flexShrink: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    // The label keeps what it needs and the control takes the rest, so a column
    // of these lines up on the end edge whatever the labels are.
    control: { flex: 1, minWidth: 0 },
});
