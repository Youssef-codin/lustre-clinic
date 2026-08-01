import type { WhatsAppStatus } from '@mawid/shared';

/**
 * Everything that sends a message goes through this. Baileys sits behind it —
 * so if the number gets restricted repeatedly, or a clinic grows enough to
 * justify paid messaging, swapping to the official WhatsApp Cloud API is a new
 * implementation rather than a rewrite. See spec §8.
 */
export interface MessageSender {
    readonly name: string;
    /**
     * `to` is a normalized E.164 number. Throws on failure; the reminder loop
     * records the message and marks the row `failed`.
     */
    send: (to: string, text: string) => Promise<void>;
    status: () => WhatsAppStatus;
    /** Unlinks the device. The next start needs a fresh pairing QR. */
    logout: () => Promise<void>;
    stop: () => Promise<void>;
}

/**
 * `+201012345678` → `201012345678@s.whatsapp.net`.
 *
 * WhatsApp addresses a chat by digits with no `+`. Kept here rather than in the
 * Baileys implementation because it is the one piece of formatting any sender
 * would need, and getting it wrong means messages go nowhere silently.
 */
export function toWhatsAppJid(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) throw new Error(`Not a sendable phone number: ${phone.slice(0, 4)}…`);
    return `${digits}@s.whatsapp.net`;
}
