/**
 * Lab work a visit waits on: a crown, bridge or denture that has to be back
 * before the patient sits down. `labStatus` is null for no lab, `pending` while
 * the work is out and `ready` once it is back. Only `pending` is loud — the
 * agenda tags it and the reminder asks about it — because "is it back yet" is
 * the question that goes wrong. `ready` is quiet: the work is in the drawer.
 */
import type { LabStatus } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import { Switch } from '../../../components/ui';
import { useT } from '../../../i18n';
import { color, radius, space, Text } from '../../../theme';
import { LabIcon } from './icons';

/**
 * The agenda's mark: a flask, not words, so the name keeps its width. The flask
 * already means lab on the booking switch and in Reminders, and the detail
 * sheet says it in full. Nothing once the work is back, and nothing without a lab.
 */
export function LabTag({ status }: { status: LabStatus | null }) {
    const t = useT();
    if (status !== 'pending') return null;
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('Lab pending')} style={styles.tag}>
            <LabIcon size={13} stroke={color.due} width={2.2} />
        </View>
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

const styles = StyleSheet.create({
    tag: {
        alignSelf: 'flex-start',
        padding: space[1],
        borderRadius: radius.sm,
        backgroundColor: color.dueSoft,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    switchText: { flex: 1, gap: space[0.5] },
});
