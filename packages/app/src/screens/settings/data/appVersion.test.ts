import { describe, expect, test } from 'bun:test';
import { apkLabel, type InstalledVersion, newerApk, updateLabel, versionLine } from './appVersion';

/**
 * The banner is the only way a phone hears about a new APK. Offered when the
 * phone is already current, it never goes away; missed when it is not, the
 * clinic runs old native code until someone visits with a cable.
 */

const latest = { versionCode: 525_600, version: '1.1.0' };

describe('newerApk', () => {
    test('offers a higher build', () => {
        expect(newerApk('525599', latest)).toEqual(latest);
        expect(newerApk('1', latest)).toEqual(latest);
    });

    test('offers nothing to a phone on that build or a later one', () => {
        expect(newerApk('525600', latest)).toBeNull();
        expect(newerApk('525601', latest)).toBeNull();
    });

    test('compares numbers, not strings', () => {
        expect(newerApk('99999', { versionCode: 100_000, version: '1.1.0' })).not.toBeNull();
        expect(newerApk('100000', { versionCode: 99_999, version: '1.0.0' })).toBeNull();
    });

    test('offers nothing when the server has no APK or the server did not answer', () => {
        expect(newerApk('1', null)).toBeNull();
        expect(newerApk('1', undefined)).toBeNull();
    });

    test('offers nothing to an install that cannot say its own build', () => {
        for (const build of [null, '', 'abc', '0', '-3', '1.5']) {
            expect(newerApk(build, latest)).toBeNull();
        }
    });
});

const installed: InstalledVersion = {
    version: '1.0.2',
    apkVersion: '1.0.0',
    build: '525600',
    updateId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    updateCreatedAt: new Date('2026-09-14T10:00:00Z'),
    embedded: false,
};

describe('versionLine', () => {
    test('names the release the phone runs, update included, and the build', () => {
        expect(versionLine(installed)).toBe('Lustre 1.0.2 (build 525600)');
        expect(versionLine({ version: '1.0.2', build: null })).toBe('Lustre 1.0.2');
    });
});

describe('apkLabel', () => {
    test('names the APK under the update', () => {
        expect(apkLabel(installed)).toBe('1.0.0 · build 525600');
        expect(apkLabel({ apkVersion: '1.0.0', build: null })).toBe('1.0.0');
        expect(apkLabel({ apkVersion: null, build: null })).toBe('—');
    });
});

describe('updateLabel', () => {
    test('names a downloaded update by its short id and day', () => {
        expect(updateLabel(installed)).toBe('7c9e6679 · 2026-09-14');
    });

    test('says when the APK runs its own bundle, or cannot take updates at all', () => {
        expect(updateLabel({ ...installed, embedded: true })).toBe('Built in');
        expect(updateLabel({ ...installed, updateId: null })).toBe('Off in this build');
    });
});
