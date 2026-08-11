import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, Text } from '../../theme';

export type FieldProps = {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    children: ReactNode;
};

export function Field({ label, required = false, hint, error, children }: FieldProps) {
    return (
        <View style={styles.field}>
            {label ? (
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
            ) : null}

            {children}

            {error || hint ? (
                <Text variant="footnote" tone={error ? 'danger' : 'muted'}>
                    {error ?? hint}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    field: { alignSelf: 'stretch', gap: space[1.5] },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[0.5] },
});
