/**
 * The clinic server, in memory, on the phone: the demo's invented clinic, or
 * local mode's real one (`./local`).
 *
 * `../client` splits on `deviceBackend()` per request, so nothing else in the
 * app knows this exists — the screens call the same procedures over the same
 * client and get the same shapes back.
 */
export { subscribeToDemoEvents } from './events';
export {
    deviceBackend,
    disableDemoMode,
    disableLocalMode,
    enableDemoMode,
    isDemoMode,
    isLocalMode,
    useDemoMode,
    useDeviceBackend,
} from './flag';
export { demoLink } from './link';
export { exportLocal, type PickedClinic, pickClinicFile } from './local';
export { LocalStoreError } from './localFormat';

import type { Role } from '@lustre/shared';
import { credentialToken, forgetDemoCredential, grantCredential, hydrateCredential } from '../credential';
import { noteDataReset } from '../dataReset';
import { clearStored, getDb, setDb, takeDirty } from './db';
import { disableLocalMode, enableLocalMode } from './flag';
import { provisionDemo } from './handlers/device';
import { openDeviceDb } from './link';
import { commitLocal, openClinicFile, type PickedClinic } from './local';
import { seedDemoDb } from './seed';

/**
 * Runs the clinic on this phone alone. The phone is its only device, so it is
 * made the admin: it books, takes payments and sets the clinic up. Entering
 * again finds the clinic and the phone's role where they were left.
 */
export async function startLocalMode(): Promise<void> {
    await enableLocalMode();
    try {
        await hydrateCredential();
        await openDeviceDb('local');
        const token = credentialToken();
        const known = getDb().devices.some((device) => device.token === token && !device.revokedAt);
        if (known) return;
        const credential = provisionDemo('admin', token, 'This phone');
        if (takeDirty()) commitLocal();
        grantCredential(credential);
    } catch (error) {
        await disableLocalMode();
        throw error;
    }
}

/**
 * Local mode on a clinic brought in from a file: another phone's export, or
 * this phone's own from before it was reset. The phone is made its admin the
 * way `startLocalMode` makes it the admin of any clinic it has not seen.
 */
export async function startLocalModeFrom(picked: PickedClinic): Promise<void> {
    openClinicFile(picked);
    await startLocalMode();
}

/**
 * Back to the clinic the demo opens on. Worth having on the settings screen:
 * a demo is given more than once, and the second run should not start on the
 * first one's cancellations.
 */
export async function resetDemoData(): Promise<void> {
    await clearStored();
    setDb(seedDemoDb());
    forgetDemoCredential();
    noteDataReset();
}

/**
 * Becomes `role` inside the demo, which has no second phone to hand this one a
 * code. The role still lives on a demo device row and every demo request is
 * checked against it, as the server checks the real one.
 */
export async function becomeInDemo(role: Role): Promise<void> {
    await openDeviceDb('demo');
    grantCredential(provisionDemo(role, credentialToken()));
}
