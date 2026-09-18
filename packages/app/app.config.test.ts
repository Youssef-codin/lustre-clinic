import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { UPDATES_CHANNEL, UPDATES_MANIFEST_PATH } from '@lustre/shared';
import type { ConfigContext } from 'expo/config';
import appConfig, { CHANNEL, glitchtipDsn, MANIFEST_PATH, releaseVersion, updatesConfig } from './app.config';

/**
 * What a release APK is built to ask for, which cannot be changed after the
 * APK is on a phone. A demo that asks, or an APK that waits on the network at
 * launch, is a fix to the wrong app or a clinic stuck on the splash screen.
 */

describe('updatesConfig', () => {
    test('asks the path and channel the server answers', () => {
        expect(MANIFEST_PATH).toBe(UPDATES_MANIFEST_PATH);
        expect(CHANNEL).toBe(UPDATES_CHANNEL);
    });

    test('is off with no server to ask', () => {
        expect(updatesConfig(undefined, false)).toEqual({ enabled: false });
        expect(updatesConfig('  ', false)).toEqual({ enabled: false });
    });

    test('is off on a demo build, whatever server it was given', () => {
        expect(updatesConfig('http://clinic.tail.ts.net:3000', true)).toEqual({ enabled: false });
    });

    test('points a release build at the clinic server and never waits on it at launch', () => {
        expect(updatesConfig('http://clinic.tail.ts.net:3000/', false)).toMatchObject({
            enabled: true,
            url: 'http://clinic.tail.ts.net:3000/updates/manifest',
            fallbackToCacheTimeout: 0,
            requestHeaders: { 'expo-channel-name': 'production' },
            codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
        });
    });

    test('verifies updates against a certificate that is in the repo', async () => {
        const certificate =
            updatesConfig('http://clinic.tail.ts.net:3000', false)?.codeSigningCertificate ?? '';
        const pem = await Bun.file(join(import.meta.dir, certificate)).text();
        expect(pem).toStartWith('-----BEGIN CERTIFICATE-----');
    });
});

describe('releaseVersion', () => {
    test('takes the number the release script passes in', () => {
        expect(releaseVersion(' 1.4.2 ', '0.0.0')).toBe('1.4.2');
    });

    test("falls back to app.json's placeholder outside a release", () => {
        expect(releaseVersion(undefined, '0.0.0')).toBe('0.0.0');
        expect(releaseVersion('', undefined)).toBe('0.0.0');
    });

    test('refuses a number that is not MAJOR.MINOR.PATCH', () => {
        expect(() => releaseVersion('1.4', '0.0.0')).toThrow('LUSTRE_VERSION');
        expect(() => releaseVersion('v1.4.2', '0.0.0')).toThrow('LUSTRE_VERSION');
    });
});

describe('runtime fingerprint', () => {
    // A config that fails to load is replaced by an empty one without a word,
    // and every numbered release would then get a runtime of its own.
    test('skips the version fields, so a release number never changes the runtime', () => {
        const config = require('./fingerprint.config.js') as { sourceSkips: string[] };
        expect(config.sourceSkips).toContain('ExpoConfigVersions');
    });
});

describe('appConfig', () => {
    const context = (demo: boolean) =>
        ({
            config: { name: 'Lustre Clinic', slug: 'lustre-clinic', extra: { demo } },
            projectRoot: import.meta.dir,
            staticConfigPath: null,
            packageJsonPath: null,
        }) as ConfigContext;

    test('reads the server from LUSTRE_UPDATES_URL and the demo flag from app.json', () => {
        const previous = process.env.LUSTRE_UPDATES_URL;
        process.env.LUSTRE_UPDATES_URL = 'http://clinic.tail.ts.net:3000';

        expect(appConfig(context(false)).updates?.enabled).toBe(true);
        expect(appConfig(context(true)).updates?.enabled).toBe(false);

        if (previous === undefined) delete process.env.LUSTRE_UPDATES_URL;
        else process.env.LUSTRE_UPDATES_URL = previous;
    });

    test('bakes the GlitchTip DSN from LUSTRE_GLITCHTIP_DSN, and never into a demo', () => {
        const previous = process.env.LUSTRE_GLITCHTIP_DSN;
        process.env.LUSTRE_GLITCHTIP_DSN = ' http://key@clinic.tail.ts.net:8000/1 ';

        expect(appConfig(context(false)).extra).toEqual({
            demo: false,
            glitchtipDsn: 'http://key@clinic.tail.ts.net:8000/1',
        });
        expect(appConfig(context(true)).extra?.glitchtipDsn).toBeNull();

        if (previous === undefined) delete process.env.LUSTRE_GLITCHTIP_DSN;
        else process.env.LUSTRE_GLITCHTIP_DSN = previous;
    });
});

describe('glitchtipDsn', () => {
    test('is empty, and reports off, when nothing was given', () => {
        expect(glitchtipDsn(undefined, false)).toBeNull();
        expect(glitchtipDsn('   ', false)).toBeNull();
    });
});
