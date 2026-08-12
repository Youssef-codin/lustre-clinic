/**
 * Settings → Users. There are no accounts: SPEC §1 has no authentication —
 * reachability on the tailnet is the authorization model, and there is no
 * `users` table. What exists is a role stored locally on the device and
 * switchable at any time by whoever holds the phone; if accounts are ever
 * wanted, they are a schema change and a real permission boundary, not a
 * settings row.
 */
import { CLIENT_ROLES, type ClientRole } from '@lustre/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Callout, Card, CardDivider, ConfirmSheet, Radio, Toast } from '../../components/ui';
import { color, radius, size, space, Text } from '../../theme';
import { Pane } from './components/Pane';

const ROLE_LABEL: Record<ClientRole, string> = {
    secretary: 'Secretary',
    doctor: 'Doctor',
};

const ROLE_SUB: Record<ClientRole, string> = {
    secretary: 'Books, checks in, takes payment, sends reminders.',
    doctor: 'Today, patient history, money, and these settings.',
};

const ROLE_EFFECTS: Record<ClientRole, readonly string[]> = {
    secretary: [
        'The fourth tab becomes Secretary',
        'The app opens on the day view',
        'Procedures and patient fields drop off this screen',
    ],
    doctor: [
        'The fourth tab becomes Doctor',
        'The app opens on today',
        'Procedures and patient fields come back to this screen',
    ],
};

export type UsersScreenProps = {
    role: ClientRole;
    onChangeRole: (role: ClientRole) => void;
    onBack: () => void;
};

export function UsersScreen({ role, onChangeRole, onBack }: UsersScreenProps) {
    const [switchingTo, setSwitchingTo] = useState<ClientRole | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    function confirmSwitch() {
        if (!switchingTo) return;
        onChangeRole(switchingTo);
        setToast(`This device is now the ${ROLE_LABEL[switchingTo].toLowerCase()}`);
        setSwitchingTo(null);
    }

    return (
        <Pane
            title="Users"
            onBack={onBack}
            overlay={
                <Toast visible={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
            }
        >
            <Callout tone="info" title="There are no accounts">
                Lustre has no logins. Any phone on the clinic's tailnet can use it, and the role below is a
                preference on this device — not a lock. Anyone holding this phone can change it.
            </Callout>

            <View style={styles.section}>
                <Text variant="eyebrow" tone="muted">
                    THIS DEVICE
                </Text>
                <Card>
                    {CLIENT_ROLES.map((option, index) => (
                        <View key={option}>
                            {index > 0 ? <CardDivider /> : null}
                            <View style={styles.row}>
                                <View style={styles.rowText}>
                                    <Text variant="body" weight="medium">
                                        {ROLE_LABEL[option]}
                                    </Text>
                                    <Text variant="subhead" tone="muted">
                                        {ROLE_SUB[option]}
                                    </Text>
                                </View>
                                <Radio
                                    selected={role === option}
                                    accessibilityLabel={ROLE_LABEL[option]}
                                    onPress={() => {
                                        if (option !== role) setSwitchingTo(option);
                                    }}
                                />
                            </View>
                        </View>
                    ))}
                </Card>
            </View>

            <ConfirmSheet
                visible={switchingTo !== null}
                title={switchingTo ? `Switch to ${ROLE_LABEL[switchingTo]}?` : ''}
                body="Nothing on the server changes. This phone shows a different set of screens."
                detail={
                    switchingTo ? (
                        <View style={styles.effects}>
                            <View style={styles.transition}>
                                <View style={styles.roleChip}>
                                    <Text variant="callout" tone="muted">
                                        {ROLE_LABEL[role]}
                                    </Text>
                                </View>
                                <Text variant="callout" tone="muted">
                                    {'→'}
                                </Text>
                                <View style={[styles.roleChip, styles.roleChipOn]}>
                                    <Text variant="callout" tone="inverse">
                                        {ROLE_LABEL[switchingTo]}
                                    </Text>
                                </View>
                            </View>

                            {ROLE_EFFECTS[switchingTo].map((effect) => (
                                <View key={effect} style={styles.effect}>
                                    <Text variant="callout" tone="muted">
                                        {'·'}
                                    </Text>
                                    <Text variant="callout" tone="ink2" style={styles.effectText}>
                                        {effect}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ) : undefined
                }
                confirmLabel="Switch"
                onConfirm={confirmSwitch}
                onCancel={() => setSwitchingTo(null)}
            />
        </Pane>
    );
}

const styles = StyleSheet.create({
    section: { gap: space[2] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size.row + space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[2.5],
    },
    rowText: { flex: 1, gap: space[0.5] },
    effects: { gap: space[2] },
    transition: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingBottom: space[1] },
    roleChip: {
        paddingHorizontal: space[3],
        paddingVertical: space[1.5],
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    roleChipOn: { backgroundColor: color.ink, borderColor: color.ink },
    effect: { flexDirection: 'row', gap: space[2] },
    effectText: { flex: 1 },
});
