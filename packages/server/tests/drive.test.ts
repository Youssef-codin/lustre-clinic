import { describe, expect, test } from 'bun:test';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
    buildJwt,
    createDriveClient,
    type DriveCredentials,
    normalizePrivateKey,
} from '../src/backup/drive.ts';

/**
 * SPEC §16 — the off-site destination. Google is stubbed: what is worth
 * asserting is that the assertion we sign is one Google would accept, that the
 * token is reused rather than re-minted per call, and that an upload carries
 * the bytes to the right folder.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const credentials: DriveCredentials = {
    clientEmail: 'mawid-backup@example.iam.gserviceaccount.com',
    privateKey: PEM,
    folderId: 'folder-123',
};

function decodeSegment(segment: string): Record<string, unknown> {
    return JSON.parse(Buffer.from(segment, 'base64url').toString());
}

/** A fetch stub that records what it was called with. */
function stubFetch(handlers: Record<string, (req: { url: string; init?: RequestInit }) => Response>) {
    const calls: { url: string; init?: RequestInit }[] = [];

    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
        calls.push({ url, init });
        const key = Object.keys(handlers).find((k) => url.includes(k));
        if (!key) throw new Error(`unexpected request to ${url}`);
        return handlers[key]?.({ url, init }) ?? new Response(null, { status: 500 });
    };

    return { impl, calls };
}

const tokenOk = () =>
    new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 3600 }), {
        headers: { 'content-type': 'application/json' },
    });

describe('normalizePrivateKey', () => {
    test('turns escaped newlines back into a PEM', () => {
        const escaped = PEM.replace(/\n/g, '\\n');
        expect(normalizePrivateKey(escaped)).toBe(PEM.trim());
    });

    test('leaves a real PEM alone', () => {
        expect(normalizePrivateKey(PEM)).toBe(PEM.trim());
    });

    test('rejects something that is not a key', () => {
        expect(() => normalizePrivateKey('hunter2')).toThrow('PEM private key');
    });
});

describe('buildJwt', () => {
    const now = Date.parse('2026-08-03T09:00:00Z');

    test('signs a verifiable RS256 assertion', () => {
        const jwt = buildJwt(credentials, now);
        const [header, claims, signature] = jwt.split('.');

        expect(decodeSegment(header ?? '')).toEqual({ alg: 'RS256', typ: 'JWT' });

        const verifier = createVerify('RSA-SHA256').update(`${header}.${claims}`);
        expect(verifier.verify(PUBLIC_PEM, Buffer.from(signature ?? '', 'base64url'))).toBe(true);
    });

    test('claims what Google expects of a service account', () => {
        const claims = decodeSegment(buildJwt(credentials, now).split('.')[1] ?? '');

        expect(claims.iss).toBe(credentials.clientEmail);
        expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
        expect(claims.scope).toBe('https://www.googleapis.com/auth/drive.file');
        expect(claims.iat).toBe(now / 1000);
        expect(claims.exp).toBe(now / 1000 + 3600);
        // No impersonation unless one was configured.
        expect(claims.sub).toBeUndefined();
    });

    test('carries the subject when impersonating', () => {
        const claims = decodeSegment(
            buildJwt({ ...credentials, subject: 'doctor@clinic.example' }, now).split('.')[1] ?? '',
        );
        expect(claims.sub).toBe('doctor@clinic.example');
    });
});

describe('createDriveClient', () => {
    test('exchanges the assertion for a token and uploads to the folder', async () => {
        let uploadBody: Buffer | undefined;

        const { impl, calls } = stubFetch({
            'oauth2.googleapis.com/token': tokenOk,
            'upload/drive/v3/files': ({ init }) => {
                uploadBody = Buffer.from(init?.body as Uint8Array);
                return new Response(JSON.stringify({ id: 'file-1' }), {
                    headers: { 'content-type': 'application/json' },
                });
            },
        });

        const client = createDriveClient({ credentials, fetchImpl: impl });
        const id = await client.upload('mawid-2026-08-03T09-00-00Z.dump.enc', new Uint8Array([1, 2, 3]));

        expect(id).toBe('file-1');

        const upload = calls.find((c) => c.url.includes('upload'));
        expect(upload?.url).toContain('uploadType=multipart');
        expect(upload?.url).toContain('supportsAllDrives=true');
        const headers = (upload?.init?.headers ?? {}) as Record<string, string>;
        expect(headers.authorization).toBe('Bearer token-abc');

        const text = uploadBody?.toString('binary') ?? '';
        expect(text).toContain('"parents":["folder-123"]');
        expect(text).toContain('mawid-2026-08-03T09-00-00Z.dump.enc');
        // The ciphertext itself is in there, between the multipart boundaries.
        expect(uploadBody?.includes(Buffer.from([1, 2, 3]))).toBe(true);
    });

    test('reuses the access token across calls', async () => {
        const { impl, calls } = stubFetch({
            'oauth2.googleapis.com/token': tokenOk,
            'drive/v3/files': () =>
                new Response(JSON.stringify({ files: [] }), {
                    headers: { 'content-type': 'application/json' },
                }),
        });

        const client = createDriveClient({ credentials, fetchImpl: impl });
        await client.list();
        await client.list();

        expect(calls.filter((c) => c.url.includes('token')).length).toBe(1);
    });

    test('re-mints the token once it has expired', async () => {
        let clock = Date.parse('2026-08-03T09:00:00Z');

        const { impl, calls } = stubFetch({
            'oauth2.googleapis.com/token': tokenOk,
            'drive/v3/files': () =>
                new Response(JSON.stringify({ files: [] }), {
                    headers: { 'content-type': 'application/json' },
                }),
        });

        const client = createDriveClient({ credentials, fetchImpl: impl, now: () => clock });
        await client.list();
        clock += 3600_000;
        await client.list();

        expect(calls.filter((c) => c.url.includes('token')).length).toBe(2);
    });

    test('follows pagination when listing', async () => {
        let page = 0;
        const { impl } = stubFetch({
            'oauth2.googleapis.com/token': tokenOk,
            'drive/v3/files': () => {
                page += 1;
                return new Response(
                    JSON.stringify(
                        page === 1
                            ? { files: [{ id: 'a', name: 'one' }], nextPageToken: 'next' }
                            : { files: [{ id: 'b', name: 'two' }] },
                    ),
                    { headers: { 'content-type': 'application/json' } },
                );
            },
        });

        const files = await createDriveClient({ credentials, fetchImpl: impl }).list();
        expect(files.map((f) => f.id)).toEqual(['a', 'b']);
    });

    test('treats a missing file as already deleted', async () => {
        const { impl } = stubFetch({
            'oauth2.googleapis.com/token': tokenOk,
            'drive/v3/files': () => new Response('gone', { status: 404 }),
        });

        await expect(
            createDriveClient({ credentials, fetchImpl: impl }).remove('file-1'),
        ).resolves.toBeUndefined();
    });

    test('surfaces a refused token request', async () => {
        const { impl } = stubFetch({
            'oauth2.googleapis.com/token': () => new Response('invalid_grant', { status: 400 }),
        });

        await expect(createDriveClient({ credentials, fetchImpl: impl }).list()).rejects.toThrow(
            'drive token request failed: 400',
        );
    });

    test('surfaces a refused upload', async () => {
        const { impl } = stubFetch({
            'oauth2.googleapis.com/token': tokenOk,
            'upload/drive/v3/files': () => new Response('storageQuotaExceeded', { status: 403 }),
        });

        await expect(
            createDriveClient({ credentials, fetchImpl: impl }).upload('x.dump.enc', new Uint8Array([1])),
        ).rejects.toThrow('storageQuotaExceeded');
    });
});
