/**
 * Confirm sheet. `loading` makes it non-dismissable: the confirm is a write and
 * every write crosses Tailscale, so a confirm in flight must not be cancellable
 * into an unknown state. Destructive red confirms exist for deactivating and the
 * like, never for saving.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, Text } from '../../theme';
import { Button } from './Button';
import { Sheet } from './Sheet';

export type ConfirmSheetProps = {
    visible: boolean;
    title: string;
    body?: string;
    detail?: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    destructive?: boolean;
    loading?: boolean;
    testID?: string;
};

export function ConfirmSheet({
    visible,
    title,
    body,
    detail,
    confirmLabel,
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    destructive = false,
    loading = false,
    testID,
}: ConfirmSheetProps) {
    return (
        <Sheet
            visible={visible}
            onClose={onCancel}
            dismissable={!loading}
            title={title}
            testID={testID}
            footer={
                <View style={styles.actions}>
                    <View style={styles.cancel}>
                        <Button
                            label={cancelLabel}
                            variant="ghost"
                            onPress={onCancel}
                            disabled={loading}
                            block
                        />
                    </View>
                    <View style={styles.confirm}>
                        <Button
                            label={confirmLabel}
                            variant={destructive ? 'danger' : 'primary'}
                            onPress={onConfirm}
                            loading={loading}
                            block
                        />
                    </View>
                </View>
            }
        >
            {body ? (
                <Text variant="body" tone="ink2">
                    {body}
                </Text>
            ) : null}
            {detail}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    actions: { flexDirection: 'row', gap: space[2] },
    cancel: { flex: 1 },
    confirm: { flex: 1.4 },
});
