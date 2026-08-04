import { createSign } from 'node:crypto';

/**
 * SPEC §16 — the off-site destination. Google Drive, reached with a service
 * account: no browser step, no refresh token to babysit, and nothing to
 * re-authorize when the clinic machine reboots at 07:00 with nobody watching.
 *
 * Written against the REST API with `fetch` and `node:crypto` rather than
 * `googleapis`, which is a very large dependency for three calls (upload, list,
 * delete).
 *
 * ## Storage ownership
 *
 * A service account has no Drive storage of its own. Uploading into a folder in
 * someone's My Drive therefore fails with `storageQuotaExceeded`, because the
 * file would be owned by the account that created it. Two configurations work:
 *
 * - **A shared drive** (Google Workspace). Share it with the service account as
 *   Content manager and point `BACKUP_DRIVE_FOLDER_ID` at a folder inside it.
 *   This is the intended setup.
 * - **Domain-wide delegation.** Set `BACKUP_DRIVE_SUBJECT` to a user the
 *   service account may impersonate; files are then owned by that user and
 *   count against their quota.
 *
 * If the clinic is on a personal Gmail account, neither is available and this
 * needs to become an OAuth refresh token against that account instead.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * `drive.file` — per-file access to what this app creates. Enough to upload,
 * list, and prune its own dumps, and nothing else in the drive. Widen to
 * `https://www.googleapis.com/auth/drive` only if the folder cannot be reached.
 */
const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Tokens last an hour; renew a minute early rather than racing the expiry. */
const TOKEN_SKEW_SECONDS = 60;

export interface DriveCredentials {
    clientEmail: string;
    /** PEM private key from the service-account JSON. */
    privateKey: string;
    /** Folder the dumps land in. Must be inside a shared drive (see above). */
    folderId: string;
    /** Optional user to impersonate, for domain-wide delegation. */
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

/**
 * A `.env` file cannot hold a literal newline, so the PEM is normally pasted
 * with `\n` escapes. Both forms are accepted.
 */
export function normalizePrivateKey(raw: string): string {
    const key = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
    if (!key.includes('BEGIN')) {
        throw new Error('BACKUP_DRIVE_PRIVATE_KEY does not look like a PEM private key');
    }
    return key.trim();
}

/**
 * The signed assertion Google exchanges for an access token (RFC 7523).
 * Exported so a test can verify the signature rather than trust the shape.
 */
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
    /** Returns the new file's id. */
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
            // The response body carries Google's reason but never a secret.
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

            // Multipart upload: one request, metadata and bytes together.
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

            // 404 means it is already gone, which is the state pruning wanted.
            if (!res.ok && res.status !== 404) {
                throw new Error(`drive delete failed: ${res.status} ${await safeText(res)}`);
            }
        },
    };
}

/** Error bodies are for the log; never let reading one mask the real failure. */
async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 300);
    } catch {
        return '';
    }
}
