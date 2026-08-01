import { logger } from '../../middleware/logger.ts';
import { setStatus } from '../status.ts';
import type { MessageSender } from './sender.ts';
import { getWhatsAppState, setWhatsAppState } from './state.ts';

/**
 * Logs the message instead of sending it. Used for all development (spec §8),
 * and the only safe way to exercise the reminder loop against real appointments
 * without messaging real patients.
 *
 * Reports `connected: true` so the rest of the system behaves exactly as it
 * would in production — but `dryRun` rides along in the status so the desk can
 * say so out loud. A connected socket that silently sends nothing looks
 * identical to a working one, which is a demo-day trap.
 */
export function dryRunSender(): MessageSender {
    setWhatsAppState({ connected: true, dryRun: true, lastError: undefined, qr: undefined });
    setStatus('whatsapp', 'ok');

    return {
        name: 'dry-run',

        async send(to: string, text: string) {
            // The number is a patient identifier; only its shape is logged.
            logger.info(
                { to: `${to.slice(0, 4)}…${to.slice(-2)}`, chars: text.length },
                'dry run — reminder not actually sent',
            );
        },

        status: getWhatsAppState,

        async logout() {
            setWhatsAppState({ connected: false });
        },

        async stop() {
            setWhatsAppState({ connected: false });
        },
    };
}
