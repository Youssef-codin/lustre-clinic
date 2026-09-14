/**
 * The expo-updates manifest for one exported bundle (protocol 1:
 * https://docs.expo.dev/technical-specs/expo-updates-1/) and the signature
 * header that goes with it. Pure, so what `release.ts` publishes is testable
 * without running an export.
 *
 * Files are addressed as `<runtime>/<id>/<path>` on the clinic server
 * (`server/src/modules/release`), which serves them from where the export put
 * them. `hash` is what the phone checks a download against (base64url SHA-256).
 * `key` names the file in the phone's asset store and must be a bare filename,
 * so it is the MD5 of the contents.
 */
import { createHash, createSign } from 'node:crypto';
import { UPDATES_ASSETS_PATH } from '@lustre/shared';

export interface ExportedFile {
    /** Relative to the export directory, as `metadata.json` lists it. */
    path: string;
    ext: string;
    bytes: Uint8Array;
}

export interface ManifestInput {
    id: string;
    createdAt: Date;
    runtimeVersion: string;
    serverUrl: string;
    bundle: ExportedFile;
    assets: ExportedFile[];
    expoClient: Record<string, unknown>;
}

interface ManifestAsset {
    hash: string;
    key: string;
    contentType: string;
    fileExtension: string;
    url: string;
}

const CONTENT_TYPES: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ttf: 'font/ttf',
    otf: 'font/otf',
    json: 'application/json',
};

export function base64UrlSha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('base64url');
}

export function manifestFor(input: ManifestInput) {
    const base = input.serverUrl.replace(/\/+$/, '');
    const describe = (file: ExportedFile, contentType: string, fileExtension: string): ManifestAsset => ({
        hash: base64UrlSha256(file.bytes),
        key: createHash('md5').update(file.bytes).digest('hex'),
        contentType,
        fileExtension,
        url: `${base}${UPDATES_ASSETS_PATH}/${input.runtimeVersion}/${input.id}/${file.path}`,
    });

    return {
        id: input.id,
        createdAt: input.createdAt.toISOString(),
        runtimeVersion: input.runtimeVersion,
        launchAsset: describe(input.bundle, 'application/javascript', '.bundle'),
        assets: input.assets.map((asset) =>
            describe(asset, CONTENT_TYPES[asset.ext] ?? 'application/octet-stream', `.${asset.ext}`),
        ),
        metadata: {},
        extra: { expoClient: input.expoClient },
    };
}

/** The `expo-signature` header for `body`, which must be sent byte for byte as signed. */
export function signManifest(body: string, privateKeyPem: string): string {
    const signature = createSign('RSA-SHA256').update(body, 'utf8').sign(privateKeyPem, 'base64');
    return `sig="${signature}", keyid="main"`;
}
