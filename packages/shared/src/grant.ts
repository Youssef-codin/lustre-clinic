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

/** The code inside a scanned QR's text, or null when it is not a Lustre grant. */
export function grantCodeOf(scanned: string): string | null {
    const text = scanned.trim();
    if (!text.startsWith(GRANT_PREFIX)) return null;
    const code = text.slice(GRANT_PREFIX.length);
    return /^[A-Za-z0-9_-]{16,128}$/.test(code) ? code : null;
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
