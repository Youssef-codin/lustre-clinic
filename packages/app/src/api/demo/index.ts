/**
 * Demo mode: the clinic server, in memory, on the phone.
 *
 * `../client` splits on `isDemoMode()` per request, so nothing else in the app
 * knows this exists — the screens call the same procedures over the same client
 * and get the same shapes back.
 */
export { subscribeToDemoEvents } from './events';
export { disableDemoMode, enableDemoMode, isDemoMode, useDemoMode } from './flag';
export { demoLink } from './link';

import type { Role } from '@lustre/shared';
import { forgetDemoCredential, grantCredential } from '../credential';
import { noteDataReset } from '../dataReset';
import { clearStored, setDb } from './db';
import { provisionDemo } from './handlers/device';
import { openDemoDb } from './link';
import { seedDemoDb } from './seed';

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
    await openDemoDb();
    grantCredential(provisionDemo(role));
}
