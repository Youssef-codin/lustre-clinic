/**
 * `app.json` is the config. This adds the one part that depends on who the
 * release is built for: the clinic server a release APK asks for OTA updates
 * (§15, infra/README.md "Releases").
 *
 * `LUSTRE_UPDATES_URL` is that server's tailnet address. It is baked into the
 * APK because expo-updates reads it before any JavaScript runs, so it cannot
 * come from setup the way the API address does. Without it, and on a demo build
 * whatever it says, updates are off and the APK runs only its own bundle: a demo
 * that took a production update would turn into the clinic's app. Debug builds
 * load Metro and never ask.
 *
 * Launch never waits on the network (`fallbackToCacheTimeout: 0`): the app
 * starts on what it already has, and an update downloads in the background and
 * runs on the next cold start. A reload mid-screen would cost the secretary a
 * half-filled booking, and a clinic in a power cut would sit on the splash
 * screen.
 *
 * Manifests are signed at publish time with a key kept out of the repo and off
 * the server. `certs/certificate.pem` is its public half, and the phone refuses
 * an update that does not verify against it.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

// `UPDATES_MANIFEST_PATH` and `UPDATES_CHANNEL` from `@lustre/shared`, spelled
// out because Expo evaluates this file outside Metro. `app.config.test.ts`
// holds the two equal.
export const MANIFEST_PATH = '/updates/manifest';
export const CHANNEL = 'production';

export function updatesConfig(updatesUrl: string | undefined, demo: boolean): ExpoConfig['updates'] {
    const base = updatesUrl?.trim().replace(/\/+$/, '');
    if (!base || demo) return { enabled: false };

    return {
        enabled: true,
        url: `${base}${MANIFEST_PATH}`,
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 0,
        requestHeaders: { 'expo-channel-name': CHANNEL },
        codeSigningCertificate: './certs/certificate.pem',
        codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
    };
}

/**
 * GlitchTip's DSN for crash reports (§17), from `LUSTRE_GLITCHTIP_DSN`. It
 * points at the clinic server's MagicDNS name and is baked in for the same
 * reason the updates URL is: a crash before setup still has to know where to
 * go. Empty turns reports off, which is every dev machine. A demo build never
 * gets one, because its crashes come from invented patients.
 */
export function glitchtipDsn(dsn: string | undefined, demo: boolean): string | null {
    const trimmed = dsn?.trim();
    return trimmed && !demo ? trimmed : null;
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
    const demo = config.extra?.demo === true;
    return {
        ...config,
        name: config.name ?? 'Lustre Clinic',
        slug: config.slug ?? 'lustre-clinic',
        updates: updatesConfig(process.env.LUSTRE_UPDATES_URL, demo),
        extra: { ...config.extra, glitchtipDsn: glitchtipDsn(process.env.LUSTRE_GLITCHTIP_DSN, demo) },
    };
}
