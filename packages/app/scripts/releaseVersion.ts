/**
 * The number every release gets, worked out by `release.ts` rather than bumped
 * by hand (infra/README.md "Versions"). Pure, so the arithmetic is tested
 * without a git repository or a build.
 *
 *   MAJOR  a change the server and the app have to ship together. By hand: `release:apk --major`.
 *   MINOR  a new APK. PATCH goes back to 0.
 *   PATCH  an OTA update on that APK: 1.4.1, 1.4.2, …
 *
 * The APK's own version, `X.Y.0` (or the patch an update restaged it with), is
 * what Android reports and what an update cannot change; the running version is
 * the update's. Both come from the same
 * two records: the `vX.Y.Z` git tags the release script leaves, and what is
 * already staged in `dist/releases`. The higher of the two wins, so a lost tag or
 * a wiped staging directory can never make a number go backwards.
 */

export interface Version {
    major: number;
    minor: number;
    patch: number;
}

const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(text: string): Version | null {
    const match = text.trim().match(SEMVER);
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function formatVersion({ major, minor, patch }: Version): string {
    return `${major}.${minor}.${patch}`;
}

export function compareVersions(a: Version, b: Version): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function highest(texts: readonly (string | null | undefined)[]): Version | null {
    let best: Version | null = null;
    for (const text of texts) {
        const version = text ? parseVersion(text) : null;
        if (version && (!best || compareVersions(version, best) > 0)) best = version;
    }
    return best;
}

export const FIRST_VERSION: Version = { major: 1, minor: 0, patch: 0 };

/**
 * The next APK: one minor above the highest version ever released, whether it
 * was an APK or an update, or one major above it with `major`. The first is 1.0.0.
 */
export function nextApkVersion(released: readonly (string | null | undefined)[], major = false): Version {
    const last = highest(released);
    if (!last) return FIRST_VERSION;
    return major
        ? { major: last.major + 1, minor: 0, patch: 0 }
        : { major: last.major, minor: last.minor + 1, patch: 0 };
}

/**
 * The next update for phones on the APK numbered `apk`: one patch above the
 * highest release on that APK's line. An update published before versioning
 * carries no number and does not count.
 */
export function nextUpdateVersion(apk: Version, released: readonly (string | null | undefined)[]): Version {
    const sameLine = released.filter((text) => {
        const version = text ? parseVersion(text) : null;
        return version?.major === apk.major && version.minor === apk.minor;
    });
    const last = highest([formatVersion(apk), ...sameLine]) ?? apk;
    return { ...last, patch: last.patch + 1 };
}

/** `v1.4.2`, the tag a release leaves on the commit it was built from. */
export function tagFor(version: Version): string {
    return `v${formatVersion(version)}`;
}
