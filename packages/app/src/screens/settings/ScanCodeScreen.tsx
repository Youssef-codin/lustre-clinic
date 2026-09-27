/**
 * Scanning an admin's role code — the only way this phone's role changes.
 *
 * The camera looks for QR codes only, and anything that is not a Lustre code is
 * refused here without asking the server. A Lustre code is redeemed once:
 * whatever the server says, the scanner stays shut until the person asks to
 * scan again, so a code held in front of the lens is not sent twice a frame.
 *
 * In demo mode there is no second phone to show a code, so the demo offers its
 * roles as buttons instead (`becomeInDemo`). The rules the demo then applies are
 * the server's, checked against the role those buttons give it.
 */
import { ERROR_CODE, grantCodeOf, ROLES, type Role } from '@lustre/shared';
import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { becomeInDemo, grantCredential, useDemoMode, useTRPC } from '../../api';
import { Button, Callout, usePendingAction } from '../../components/ui';
import { useT } from '../../i18n';
import { color, radius, space, Text } from '../../theme';
import { Pane } from './components/Pane';
import { errorText } from './data/errors';

export const ROLE_NAME: Record<Role, string> = { admin: 'Admin', doctor: 'Doctor', secretary: 'Secretary' };

const REFUSED = {
    [ERROR_CODE.GRANT_INVALID]: 'This code was not made by this clinic’s server.',
    [ERROR_CODE.GRANT_EXPIRED]: 'This code has expired. Ask for a new one.',
    [ERROR_CODE.GRANT_USED]: 'This code has already been used on a phone. Ask for a new one.',
    [ERROR_CODE.GRANT_REVOKED]: 'This code was withdrawn. Ask for a new one.',
};

export type ScanCodeScreenProps = {
    onBack: () => void;
    /** The phone has its new role. The caller says so and closes this. */
    onGranted: (role: Role) => void;
};

export function ScanCodeScreen({ onBack, onGranted }: ScanCodeScreenProps) {
    const t = useT();
    const trpc = useTRPC();
    const demo = useDemoMode();
    const [permission, requestPermission] = useCameraPermissions();
    const [problem, setProblem] = useState<string | null>(null);
    // Closed from the first read until the person asks again, so one code
    // held up to the lens is one request, not one per frame.
    const [scanning, setScanning] = useState(true);

    const redeem = useMutation(trpc.device.redeem.mutationOptions());

    async function scanned(data: string) {
        if (!scanning) return;
        setScanning(false);
        const code = grantCodeOf(data);
        if (!code) {
            setProblem(t('That is not a Lustre role code.'));
            return;
        }
        try {
            const granted = await redeem.mutateAsync({ code });
            grantCredential(granted);
            onGranted(granted.role);
        } catch (error) {
            setProblem(errorText(error, REFUSED));
        }
    }

    const become = usePendingAction(async (role: Role) => {
        await becomeInDemo(role);
        onGranted(role);
    });

    function again() {
        setProblem(null);
        setScanning(true);
    }

    return (
        <Pane title="Scan a role code" onBack={onBack} testID="scan-code-pane">
            <Text variant="subhead" tone="muted">
                {t(
                    'An admin makes a code for this phone in Settings → Phones & role codes. Hold it inside the frame.',
                )}
            </Text>

            {demo.enabled ? (
                <View style={styles.demo}>
                    <Callout tone="info" title="Demo mode">
                        {t('There is no second phone in the demo. Pick the role this phone should have.')}
                    </Callout>
                    {ROLES.map((role) => (
                        <Button
                            key={role}
                            label={ROLE_NAME[role]}
                            variant="secondary"
                            size="lg"
                            block
                            loading={become.pending}
                            onPress={() => become.run(role)}
                            testID={`scan-demo-${role}`}
                        />
                    ))}
                </View>
            ) : !permission ? null : !permission.granted ? (
                <View style={styles.demo}>
                    <Callout tone="warning" title="The camera is off">
                        {t(
                            permission.canAskAgain
                                ? 'Lustre needs the camera to read the code.'
                                : 'Turn the camera on for Lustre in Android settings, then come back.',
                        )}
                    </Callout>
                    {permission.canAskAgain ? (
                        <Button
                            label="Allow the camera"
                            size="lg"
                            block
                            onPress={() => void requestPermission()}
                            testID="scan-allow-camera"
                        />
                    ) : null}
                </View>
            ) : (
                <View style={styles.viewfinder}>
                    <CameraView
                        style={styles.camera}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={scanning ? ({ data }) => void scanned(data) : undefined}
                        testID="scan-camera"
                    />
                </View>
            )}

            {redeem.isPending ? (
                <Text variant="subhead" tone="muted" style={styles.status}>
                    {t('Checking the code…')}
                </Text>
            ) : null}

            {problem ? (
                <View style={styles.demo}>
                    <Callout tone="warning">{problem}</Callout>
                    <Button label="Scan again" size="lg" block onPress={again} testID="scan-again" />
                </View>
            ) : null}
        </Pane>
    );
}

const styles = StyleSheet.create({
    demo: { gap: space[3], marginTop: space[4] },
    viewfinder: {
        marginTop: space[4],
        aspectRatio: 1,
        borderRadius: radius.xl2,
        overflow: 'hidden',
        backgroundColor: color.inkDeep,
    },
    camera: { flex: 1 },
    status: { marginTop: space[3], textAlign: 'center' },
});
