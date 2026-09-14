/**
 * Which build this phone runs, in the words the doctor reads out over the
 * phone, and whether the clinic server has a newer APK than that (§15). Pure, so
 * `bun test` reaches it; `appUpdate.ts` supplies the native values.
 */
import type { RouterOutput } from '../../../api';

type LatestApk = NonNullable<RouterOutput['release']['latestApk']>;

export interface InstalledVersion {
    /** `expo.version` of the installed APK. An OTA update does not change it. */
    version: string | null;
    /** The APK's versionCode. */
    build: string | null;
    /** Null when updates are off: a dev, demo or local build. */
    updateId: string | null;
    updateCreatedAt: Date | null;
    embedded: boolean;
}

/**
 * The server's APK when it is newer than this install, otherwise null. An
 * install that cannot say its own build number is not offered one, or the
 * banner would never go away.
 */
export function newerApk(
    installedBuild: string | null,
    latest: LatestApk | null | undefined,
): LatestApk | null {
    if (!latest || installedBuild === null) return null;
    const installed = Number(installedBuild);
    if (!Number.isSafeInteger(installed) || installed <= 0) return null;
    return latest.versionCode > installed ? latest : null;
}

export function versionLine({ version, build }: Pick<InstalledVersion, 'version' | 'build'>): string {
    const name = `Lustre ${version ?? '0.0.0'}`;
    return build ? `${name} (build ${build})` : name;
}

/** The JavaScript this launch runs: the bundle in the APK, or an update by its short id and day. */
export function updateLabel({ updateId, updateCreatedAt, embedded }: InstalledVersion): string {
    if (updateId === null) return 'Off in this build';
    if (embedded) return 'Built in';
    const day = updateCreatedAt ? ` · ${updateCreatedAt.toISOString().slice(0, 10)}` : '';
    return `${updateId.slice(0, 8)}${day}`;
}
