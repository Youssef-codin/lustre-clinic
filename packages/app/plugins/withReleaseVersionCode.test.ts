import { describe, expect, test } from 'bun:test';
import { applyReleaseVersionCode, EPOCH_MS, versionCodeAt } from './withReleaseVersionCode';

/**
 * A number that ever goes backwards blocks the install, and one that stands
 * still hides which build a phone runs. Both are silent until the clinic visit.
 */

describe('release versionCode', () => {
    test('counts from 2026-01-01 UTC', () => {
        expect(new Date(EPOCH_MS).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    test('is higher for a build a minute later', () => {
        const first = versionCodeAt(Date.UTC(2026, 8, 14, 9, 0));
        expect(versionCodeAt(Date.UTC(2026, 8, 14, 9, 1))).toBe(first + 1);
    });

    test('is above the 1 every build before it shipped with', () => {
        expect(versionCodeAt(Date.UTC(2026, 8, 14))).toBeGreaterThan(1);
    });

    test("stays under Android's ceiling for thousands of years", () => {
        const threeThousandYears = 3000 * 365.25 * 24 * 60 * 60 * 1000;
        expect(versionCodeAt(EPOCH_MS + threeThousandYears)).toBeLessThan(2_100_000_000);
    });
});

describe('applyReleaseVersionCode', () => {
    const gradle = applyReleaseVersionCode('android {\n}\n');

    test('stamps release builds only, with the number the tests above describe', () => {
        expect(gradle).toContain("onVariants(selector().withBuildType('release'))");
        expect(gradle).toContain(`(System.currentTimeMillis() - ${EPOCH_MS}L).intdiv(60000L)`);
    });

    test('changes nothing on a second prebuild', () => {
        expect(applyReleaseVersionCode(gradle)).toBe(gradle);
    });
});
