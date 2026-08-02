import QRCode from 'qrcode';
import { logger } from '../../middleware/logger.ts';

/**
 * Baileys hands over the pairing code as a string. The desk needs something a
 * phone camera can read, and the server already has `qrcode` installed for
 * printing — so it renders the image here rather than shipping a second QR
 * encoder to the browser just to redraw a value the server already holds.
 *
 * The panel falls back to showing the raw string if this returns one, which is
 * honest but not scannable — a fallback, not the path anyone should be on.
 */

/**
 * Error correction L. The pairing string is ~270 characters, which is near the
 * top of what a QR holds; a higher level pushes the code to a denser version
 * that renders smaller per module on the same screen and scans worse. Unlike a
 * printed slip this code lives on a backlit screen for twenty seconds and is
 * never folded, so there is no damage to recover from.
 */
const ERROR_CORRECTION = 'L' as const;

/** Matches the panel's 224px plate at 2× so it stays sharp on a HiDPI screen. */
const WIDTH = 448;

export async function renderPairingQr(pairing: string): Promise<string> {
    try {
        return await QRCode.toDataURL(pairing, {
            errorCorrectionLevel: ERROR_CORRECTION,
            width: WIDTH,
            // The panel draws this on a white plate already; a transparent
            // margin would let the tinted alert background bleed into the quiet
            // zone, which is exactly what stops a code scanning.
            color: { dark: '#000000', light: '#ffffff' },
            margin: 2,
        });
    } catch (err) {
        // Never fatal: the raw string still pairs if someone types it, and a
        // failed render must not cost the clinic the ability to link at all.
        logger.error({ err }, 'could not render the pairing QR — falling back to raw text');
        return pairing;
    }
}
