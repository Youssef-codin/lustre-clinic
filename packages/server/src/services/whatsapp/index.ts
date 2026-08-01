import type { WhatsAppStatus } from '@mawid/shared';
import type { Config } from '../../config/index.ts';
import { logger } from '../../middleware/logger.ts';
import { setStatus } from '../status.ts';
import { baileysSender } from './baileys.sender.ts';
import { dryRunSender } from './dryrun.sender.ts';
import type { MessageSender } from './sender.ts';
import { getWhatsAppState, resetWhatsAppState, setWhatsAppState } from './state.ts';

export type { MessageSender } from './sender.ts';
export { toWhatsAppJid } from './sender.ts';

let sender: MessageSender | null = null;

/**
 * Started from `server.ts` after migrations. A WhatsApp that will not connect
 * must not stop the clinic booking appointments, so a failure here is loud but
 * not fatal — the desk shows it and reminders wait.
 */
export async function startWhatsApp(config: Config): Promise<void> {
    resetWhatsAppState(config.whatsapp.dryRun);

    if (!config.reminders.enabled) {
        setStatus('whatsapp', 'disabled');
        logger.info('reminders are disabled by config — whatsapp not started');
        return;
    }

    if (config.whatsapp.dryRun) {
        sender = dryRunSender();
        logger.warn('whatsapp is in dry-run mode — reminders will be logged, not sent');
        return;
    }

    try {
        sender = await baileysSender(config);
    } catch (err) {
        setWhatsAppState({ connected: false, lastError: (err as Error).message });
        logger.error({ err }, 'whatsapp failed to start — reminders will not send');
    }
}

/** The reminder loop asks for this each tick rather than holding a reference,
 *  so a re-linked socket is picked up without a restart. */
export function getSender(): MessageSender | null {
    return sender;
}

/** Installs a sender directly — how `startWhatsApp` wires one up, and the seam
 *  the reminder tests drive so they never touch a real socket. */
export function setSender(next: MessageSender | null): void {
    sender = next;
}

export function getWhatsAppStatus(): WhatsAppStatus {
    return getWhatsAppState();
}

export async function logoutWhatsApp(): Promise<WhatsAppStatus> {
    await sender?.logout();
    return getWhatsAppState();
}

export async function stopWhatsApp(): Promise<void> {
    await sender?.stop();
    sender = null;
}
