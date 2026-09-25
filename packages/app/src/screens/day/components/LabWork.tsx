/**
 * Lab work a visit waits on: a crown, bridge or denture that has to be back
 * before the patient sits down. `labStatus` is null for no lab, `pending` while
 * the work is out and `ready` once it is back. Only `pending` is loud — the
 * agenda tags it and the reminder asks about it — because "is it back yet" is
 * the question that goes wrong. `ready` is quiet: the work is in the drawer.
 */
import type { LabStatus } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import { Switch, Tag } from '../../../components/ui';
import { useT } from '../../../i18n';
import { color, space, Text } from '../../../theme';
import { LabIcon } from './icons';

/** The agenda's tag. Nothing once the work is back, and nothing without a lab. */
export function LabTag({ status }: { status: LabStatus | null }) {
    if (status !== 'pending') return null;
    return (
        <Tag tone="due" variant="filled">
            LAB PENDING
        </Tag>
    );
}

export type LabSwitchProps = {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    testID?: string;
};

export function LabSwitch({ value, onValueChange, disabled = false, testID }: LabSwitchProps) {
    const t = useT();
    return (
        <View style={styles.switchRow}>
            <LabIcon size={17} stroke={value ? color.ink : color.muted} />
            <View style={styles.switchText}>
                <Text variant="callout" weight="medium">
                    {t('Needs lab')}
                </Text>
                <Text variant="caption" tone="muted">
                    {t('A crown, bridge or denture that has to be back before the visit.')}
                </Text>
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                disabled={disabled}
                accessibilityLabel="Needs lab"
                testID={testID}
            />
        </View>
    );
}

/** Where the work is, in words, for the detail sheet. */
export function LabState({ status }: { status: LabStatus }) {
    const t = useT();
    const back = status === 'ready';
    return (
        <View style={styles.state}>
            <LabIcon size={15} stroke={back ? color.success : color.due} />
            <Text variant="subhead" weight="semibold" tone={back ? 'success' : 'due'}>
                {back ? t('Back from the lab') : t('Not back from the lab yet')}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    switchText: { flex: 1, gap: space[0.5] },
    state: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
