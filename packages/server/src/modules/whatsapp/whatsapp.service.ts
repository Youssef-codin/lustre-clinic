import type { WhatsAppStatus } from '@mawid/shared';
import { getWhatsAppStatus, logoutWhatsApp } from '../../services/whatsapp/index.ts';

export function readStatus(): WhatsAppStatus {
    return getWhatsAppStatus();
}

/**
 * Unlinks the device and returns the state that leaves behind, so the desk
 * renders the result of the click without waiting for the pushed event.
 */
export function logout(): Promise<WhatsAppStatus> {
    return logoutWhatsApp();
}
