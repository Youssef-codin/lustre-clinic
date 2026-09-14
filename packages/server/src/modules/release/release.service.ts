/**
 * SPEC §15. What the operator's release script (`packages/app/scripts/release.ts`)
 * stages in `RELEASES_DIR`, and the ansible `releases` tag copies to the clinic:
 *
 *   android/latest.json                 { versionCode, version, runtimeVersion }
 *   android/lustre.apk
 *   updates/<runtime>/latest.json       { id } — the update that runtime gets
 *   updates/<runtime>/<id>/manifest.json, signature, and the exported files
 *
 * The manifest is signed on the operator's machine when it is published, so the
 * private key never reaches this server, and it is served byte for byte because
 * the signature covers those bytes.
 *
 * Nothing here throws. No releases at all is where every fresh install starts,
 * and a phone reads "nothing newer" and "no answer" the same way.
 */
import { join, resolve } from 'node:path';
import type { BunFile } from 'bun';
import { z } from 'zod';
import { config } from '../../config.ts';

const APK_FILE = 'lustre.apk';

const apkMetadata = z.object({
    versionCode: z.number().int().positive(),
    version: z.string().min(1),
});

const updatePointer = z.object({ id: z.uuid() });

type LatestApk = z.infer<typeof apkMetadata>;

interface PublishedUpdate {
    id: string;
    manifest: string;
    signature: string | null;
}

// Runtime versions are fingerprint hashes, ids are UUIDs and asset paths are
// what `expo export` writes, so a segment outside this pattern is refused before
// it reaches the filesystem. `.` and `..` fit the pattern and are refused by name.
function isSafeSegment(segment: string): boolean {
    return /^[A-Za-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..';
}

function releasesDir(): string {
    return resolve(config.RELEASES_DIR);
}

async function existing(path: string): Promise<BunFile | null> {
    const file = Bun.file(path);
    return (await file.exists()) ? file : null;
}

async function readJson(path: string): Promise<unknown> {
    const file = await existing(path);
    return file ? file.json().catch(() => null) : null;
}

export const releaseService = {
    async latestApk(): Promise<LatestApk | null> {
        const android = join(releasesDir(), 'android');
        const metadata = apkMetadata.safeParse(await readJson(join(android, 'latest.json')));
        if (!metadata.success || !(await existing(join(android, APK_FILE)))) return null;
        return { versionCode: metadata.data.versionCode, version: metadata.data.version };
    },

    async apk(): Promise<{ file: BunFile; metadata: LatestApk } | null> {
        const metadata = await releaseService.latestApk();
        const file = await existing(join(releasesDir(), 'android', APK_FILE));
        return metadata && file ? { file, metadata } : null;
    },

    async latestUpdate(runtimeVersion: string): Promise<PublishedUpdate | null> {
        if (!isSafeSegment(runtimeVersion)) return null;
        const runtimeDir = join(releasesDir(), 'updates', runtimeVersion);
        const pointer = updatePointer.safeParse(await readJson(join(runtimeDir, 'latest.json')));
        if (!pointer.success) return null;

        const manifest = await existing(join(runtimeDir, pointer.data.id, 'manifest.json'));
        if (!manifest) return null;
        const signature = await existing(join(runtimeDir, pointer.data.id, 'signature'));

        return {
            id: pointer.data.id,
            manifest: await manifest.text(),
            signature: signature ? (await signature.text()).trim() : null,
        };
    },

    /** `segments` is `<runtime>/<id>/<path inside the export>`. */
    async updateAsset(segments: string[]): Promise<BunFile | null> {
        if (segments.length < 3 || !segments.every(isSafeSegment)) return null;
        return existing(join(releasesDir(), 'updates', ...segments));
    },
};
