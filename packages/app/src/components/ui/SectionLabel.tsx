import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { size, space, Text } from '../../theme';

export type SectionLabelProps = {
    children: string;
    count?: number;
    action?: ReactNode;
    inset?: boolean;
};

export function SectionLabel({ children, count, action, inset = true }: SectionLabelProps) {
    return (
        <View style={[styles.row, inset && styles.inset]}>
            <Text variant="eyebrow" tone="muted">
                {children}
            </Text>
            {count === undefined ? null : (
                <Text variant="eyebrow" tone="muted">
                    {String(count)}
                </Text>
            )}
            <View style={styles.spacer} />
            {action}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: space[6] },
    inset: { paddingHorizontal: size.gutter },
    spacer: { flex: 1 },
});
