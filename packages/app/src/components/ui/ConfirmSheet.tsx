import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, Text } from '../../theme';
import { Button } from './Button';
import { Sheet } from './Sheet';

export type ConfirmSheetProps = {
    visible: boolean;
    title: string;
    body?: string;
    /** A Callout, usually — what the confirm actually does to existing data. */
    detail?: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** Red confirm. Deactivating counts; saving does not. */
    destructive?: boolean;
    /**
     * The confirm is a write and every write crosses Tailscale. Hold this true
     * until the server answers: the sheet stops being dismissable, so a confirm
     * in flight cannot be cancelled into an unknown state.
     */
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
                // 1 : 1.4 — the confirm is the wider one, in both designs.
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
