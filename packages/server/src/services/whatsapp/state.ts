import type { WhatsAppStatus } from '@mawid/shared';
import { logger } from '../../middleware/logger.ts';
import { broadcast } from '../../ws/index.ts';
import { setStatus } from '../status.ts';

/**
 * One place holding the socket's connection state, because it arrives from
 * three directions — the Baileys event stream, `/api/whatsapp/status`, and the
 * `whatsapp:status` push — and all three must agree.
 *
 * Every change is broadcast. A dropped socket that the desk never hears about
 * is the same as a silent failure: reminders stop and nobody knows until a
 * patient does not turn up.
 */

let state: WhatsAppStatus = { connected: false, dryRun: false };

export function getWhatsAppState(): WhatsAppStatus {
    return state;
}

export function setWhatsAppState(next: Partial<WhatsAppStatus>): void {
    const merged: WhatsAppStatus = { ...state, ...next };

    // `qr` and `lastError` are cleared by passing undefined explicitly, which a
    // spread would otherwise preserve from the previous state.
    if ('qr' in next && next.qr === undefined) delete merged.qr;
    if ('lastError' in next && next.lastError === undefined) delete merged.lastError;

    const changed = JSON.stringify(merged) !== JSON.stringify(state);
    state = merged;
    if (!changed) return;

    setStatus('whatsapp', state.connected ? 'ok' : 'down');

    // The QR is a pairing token — logged as a fact, never as its value.
    logger.info(
        { connected: state.connected, hasQr: Boolean(state.qr), dryRun: state.dryRun },
        'whatsapp connection state changed',
    );

    broadcast('whatsapp:status', state);
}

/** Called at boot before anything connects. */
export function resetWhatsAppState(dryRun: boolean): void {
    state = { connected: false, dryRun };
    setStatus('whatsapp', 'down');
}
