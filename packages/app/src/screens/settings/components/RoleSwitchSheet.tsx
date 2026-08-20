/**
 * Switching the phone between doctor and secretary. The mockup makes this a
 * sheet rather than a settings pane, and states the consequences before the
 * button rather than after it. `from → to` is spelled out for the same reason —
 * the person tapping is often not the person the phone currently says it is.
 *
 * There is nothing behind this to authenticate against: SPEC §1 has no
 * authentication, reachability on the tailnet is the authorization model, and
 * there is no `users` table. The role is a preference held on the device and
 * switchable by whoever is holding it, which is exactly what the sheet's body
 * tells the user — it gates rows, never access. Accounts would be a schema
 * change and a real permission boundary, not a longer version of this sheet.
 */
import type { ClientRole } from '@lustre/shared';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet } from '../../../components/ui';
import { color, radius, space, Text } from '../../../theme';
import { ArrowRightIcon, CheckIcon } from './icons';

export type RoleSwitchSheetProps = {
    visible: boolean;
    /** The role the phone is on now; the sheet switches to the other one. */
    role: ClientRole;
    fromName: string;
    toName: string;
    onConfirm: () => void;
    onCancel: () => void;
};

const ROLE_WORD: Record<ClientRole, string> = {
    doctor: 'the doctor',
    secretary: 'the secretary',
};

const EFFECTS: Record<ClientRole, readonly string[]> = {
    doctor: [
        "You'll see the doctor's day view and clinic settings",
        'Prices, procedures and patient fields become editable',
    ],
    secretary: [
        "You'll see the desk view: check-in, payments, reminders",
        'Clinic settings and prices are hidden',
    ],
};

export function RoleSwitchSheet({
    visible,
    role,
    fromName,
    toName,
    onConfirm,
    onCancel,
}: RoleSwitchSheetProps) {
    const other: ClientRole = role === 'doctor' ? 'secretary' : 'doctor';
    const word = ROLE_WORD[other];

    return (
        <Sheet
            visible={visible}
            onClose={onCancel}
            title={`Switch to ${word}?`}
            subtitle="Everyone signed in on this device shares one login. Switching changes what this app shows and what it lets you do."
            testID="settings-role-sheet"
            footer={
                <>
                    <Button
                        label={`Switch to ${word}`}
                        onPress={onConfirm}
                        block
                        testID="settings-role-confirm"
                    />
                    <Button label="Cancel" variant="ghost" onPress={onCancel} block />
                </>
            }
        >
            <View style={styles.swap}>
                <View style={styles.end}>
                    <Text variant="eyebrow" tone="muted">
                        FROM
                    </Text>
                    <Text variant="body" weight="semibold" style={styles.name}>
                        {fromName}
                    </Text>
                </View>

                <ArrowRightIcon size={18} />

                <View style={[styles.end, styles.toEnd]}>
                    <Text variant="eyebrow" tone="muted">
                        TO
                    </Text>
                    <Text variant="body" weight="semibold" style={styles.name}>
                        {toName}
                    </Text>
                </View>
            </View>

            {EFFECTS[other].map((effect) => (
                <View key={effect} style={styles.effect}>
                    <CheckIcon size={15} />
                    <Text variant="subhead" tone="ink2" style={styles.effectText}>
                        {effect}
                    </Text>
                </View>
            ))}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    swap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[3.5],
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    end: { flex: 1, minWidth: 0 },
    toEnd: { alignItems: 'flex-end' },
    name: { marginTop: space[1] },

    // No margin between effects: the sheet's body already gaps its children,
    // which is the mockup's 11px to within a point.
    effect: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
    effectText: { flex: 1 },
});
