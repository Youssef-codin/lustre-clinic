/**
 * A role grant as it travels from the admin's screen to the new phone's camera:
 * a QR code whose text is `GRANT_PREFIX` and a random code. The code is the
 * whole secret — the server keeps only its hash — so it is single-use and
 * short-lived rather than anything a phone could keep.
 *
 * The prefix is what lets the scanner refuse a menu's QR code as "not a Lustre
 * code" without asking the server, and the version in it is what a later format
 * would change.
 */
import qrcode from 'qrcode-generator';

export const GRANT_PREFIX = 'lustre-grant:v1:';

/** Long enough to hand a phone across the desk; short enough that a photo of the screen is worth little. */
export const GRANT_TTL_MINUTES = 30;

/** The name an admin gives the phone a code is for, e.g. "Reception". */
export const MAX_DEVICE_LABEL = 60;

/** The header a provisioned phone sends its credential in, on tRPC and on `/ws`. */
export const DEVICE_TOKEN_HEADER = 'authorization';

export function grantPayload(code: string): string {
    return `${GRANT_PREFIX}${code}`;
}

/** The clinic server's page a role QR opens in a phone's browser. */
export const JOIN_PATH = '/join';

/** The app's own link, which the join page hands the code and the server to. */
export const JOIN_APP_PATH = 'join';

/**
 * A role QR as a web address: any phone's camera opens it, and the page there
 * offers the app and then opens it on the code. The code rides in the fragment,
 * which a browser never sends, so it stays out of the server's request log.
 */
export function joinUrl(server: string, code: string): string {
    return `${server.replace(/\/+$/, '')}${JOIN_PATH}#${code}`;
}

const CODE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * The code in whatever the camera read: the bare `GRANT_PREFIX` form, the join
 * page's address, or the app link the page opens. Null for anything else.
 */
export function grantCodeOf(scanned: string): string | null {
    const text = scanned.trim();
    const code = text.startsWith(GRANT_PREFIX)
        ? text.slice(GRANT_PREFIX.length)
        : (JOIN_PAGE.exec(text)?.[1] ?? appJoinParams(text)?.get('code') ?? null);
    return code && CODE.test(code) ? code : null;
}

// Parsed by hand rather than with `URL`: React Native's is partial, and has no
// `searchParams` to speak of.
const JOIN_PAGE = new RegExp(`^https?://[^/?#]+${JOIN_PATH}/?#([^#?&]+)$`);
const APP_JOIN = new RegExp(`^[a-z][a-z0-9.+-]*://${JOIN_APP_PATH}/?\\?(.*)$`, 'i');

function appJoinParams(link: string): Map<string, string> | null {
    const query = APP_JOIN.exec(link)?.[1];
    if (query === undefined) return null;
    const params = new Map<string, string>();
    for (const pair of query.split('&')) {
        const [key, value = ''] = pair.split('=');
        if (!key) continue;
        try {
            params.set(decodeURIComponent(key), decodeURIComponent(value));
        } catch {
            return null;
        }
    }
    return params;
}

/** What the app link carries: the code, and the server the join page was served by. */
export function joinLinkOf(link: string): { code: string; server: string | null } | null {
    const params = appJoinParams(link.trim());
    const code = params?.get('code');
    if (!params || !code || !CODE.test(code)) return null;
    const server = params.get('server') ?? null;
    return { code, server: server && /^https?:\/\/[^\s]+$/.test(server) ? server : null };
}

/**
 * The QR's modules, row by row, `true` for dark. One encoder for the terminal
 * the first admin code is printed in and for the admin's screen, so the two can
 * never disagree about what a code looks like.
 */
export function qrModules(text: string): boolean[][] {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    return Array.from({ length: count }, (_, row) =>
        Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
    );
}
