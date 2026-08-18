// The app shell: the bottom tab bar and the four clusters under it (SPEC §18 F3),
// plus the two screens that stand in front of it — setup (F1) and offline.
export { AppShell } from './AppShell';
export { OfflineScreen } from './OfflineScreen';
export { SetupScreen } from './SetupScreen';
export type { ServerSetup, SetupState } from './serverStore';
export { requestReconfigure, saveServerAddresses, useServerSetup } from './serverStore';
