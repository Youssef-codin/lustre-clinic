/**
 * SPEC §16 — the off-site destination. Google Drive, reached with a service
 * account: no browser step, no refresh token to babysit, and nothing to
 * re-authorize when the clinic machine reboots at 07:00 with nobody watching.
 *
 * Written against the REST API with `fetch` and `node:crypto` rather than
 * `googleapis`, which is a very large dependency for three calls (upload, list,
 * delete).
 *
 * A service account has no Drive storage of its own: uploading into a folder in
 * someone's My Drive fails with `storageQuotaExceeded`. Use a shared drive
 * (`BACKUP_DRIVE_FOLDER_ID` inside one) or domain-wide delegation via
 * `BACKUP_DRIVE_SUBJECT`; on a personal Gmail account neither is available and
 * this needs an OAuth refresh token instead.
 *
 * Error bodies are read for the log but never include secrets; a 404 on delete
 * means the file is already gone, which is the state pruning wanted.
 */
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const TOKEN_SKEW_SECONDS = 60;

export interface DriveCredentials {
    clientEmail: string;
    privateKey: string;
    folderId: string;
    subject?: string;
    scope?: string;
}

export interface DriveOptions {
    credentials: DriveCredentials;
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    now?: () => number;
}

export interface DriveFile {
    id: string;
    name: string;
}

function base64Url(input: string | Uint8Array): string {
    return Buffer.from(input as never)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function normalizePrivateKey(raw: string): string {
    const key = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
    if (!key.includes('BEGIN')) {
        throw new Error('BACKUP_DRIVE_PRIVATE_KEY does not look like a PEM private key');
    }
    return key.trim();
}

export function buildJwt(credentials: DriveCredentials, nowMs: number): string {
    const issuedAt = Math.floor(nowMs / 1000);

    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
        iss: credentials.clientEmail,
        scope: credentials.scope ?? DEFAULT_SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600,
        ...(credentials.subject ? { sub: credentials.subject } : {}),
    };

    const body = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
    const signature = createSign('RSA-SHA256').update(body).sign(normalizePrivateKey(credentials.privateKey));

    return `${body}.${base64Url(signature)}`;
}

export interface DriveClient {
    upload(name: string, body: Uint8Array, mimeType?: string): Promise<string>;
    list(): Promise<DriveFile[]>;
    remove(fileId: string): Promise<void>;
}

export function createDriveClient(options: DriveOptions): DriveClient {
    const { credentials, fetchImpl = fetch, now = Date.now } = options;

    let cached: { token: string; expiresAtMs: number } | undefined;

    async function accessToken(): Promise<string> {
        if (cached && cached.expiresAtMs > now()) return cached.token;

        const res = await fetchImpl(TOKEN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: buildJwt(credentials, now()),
            }).toString(),
            signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
            throw new Error(`drive token request failed: ${res.status} ${await safeText(res)}`);
        }

        const json = (await res.json()) as { access_token?: string; expires_in?: number };
        if (!json.access_token) throw new Error('drive token response had no access_token');

        cached = {
            token: json.access_token,
            expiresAtMs: now() + ((json.expires_in ?? 3600) - TOKEN_SKEW_SECONDS) * 1000,
        };
        return cached.token;
    }

    async function authed(url: string, init: RequestInit = {}): Promise<Response> {
        const token = await accessToken();
        return fetchImpl(url, {
            ...init,
            headers: { ...init.headers, authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10 * 60_000),
        });
    }

    return {
        async upload(name, body, mimeType = 'application/octet-stream'): Promise<string> {
            const metadata = { name, parents: [credentials.folderId] };

            const boundary = `mawid-${crypto.randomUUID()}`;
            const parts = Buffer.concat([
                Buffer.from(
                    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
                        `${JSON.stringify(metadata)}\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
                ),
                Buffer.from(body),
                Buffer.from(`\r\n--${boundary}--\r\n`),
            ]);

            const res = await authed(`${UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true`, {
                method: 'POST',
                headers: { 'content-type': `multipart/related; boundary=${boundary}` },
                body: parts,
            });

            if (!res.ok) throw new Error(`drive upload failed: ${res.status} ${await safeText(res)}`);

            const json = (await res.json()) as { id?: string };
            if (!json.id) throw new Error('drive upload response had no file id');
            return json.id;
        },

        async list(): Promise<DriveFile[]> {
            const files: DriveFile[] = [];
            let pageToken: string | undefined;

            do {
                const params = new URLSearchParams({
                    q: `'${credentials.folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name)',
                    pageSize: '1000',
                    supportsAllDrives: 'true',
                    includeItemsFromAllDrives: 'true',
                });
                if (pageToken) params.set('pageToken', pageToken);

                const res = await authed(`${FILES_URL}?${params}`);
                if (!res.ok) throw new Error(`drive list failed: ${res.status} ${await safeText(res)}`);

                const json = (await res.json()) as {
                    files?: DriveFile[];
                    nextPageToken?: string;
                };
                files.push(...(json.files ?? []));
                pageToken = json.nextPageToken;
            } while (pageToken);

            return files;
        },

        async remove(fileId: string): Promise<void> {
            const res = await authed(`${FILES_URL}/${fileId}?supportsAllDrives=true`, { method: 'DELETE' });

            if (!res.ok && res.status !== 404) {
                throw new Error(`drive delete failed: ${res.status} ${await safeText(res)}`);
            }
        },
    };
}

async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 300);
    } catch {
        return '';
    }
}
