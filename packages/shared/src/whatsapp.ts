/**
 * `GET /api/whatsapp/status` → `WhatsAppStatus`
 * `POST /api/whatsapp/logout` → `WhatsAppStatus` (the state after unlinking)
 *
 * The socket drops on its own and reconnects with backoff, so this is polled by
 * nothing — it is pushed on `whatsapp:status` and fetched once on load. See §8.
 */
export interface WhatsAppStatus {
    connected: boolean;
    /**
     * Pairing QR, present only while unlinked. Linking is done from the desk UI
     * rather than by finding the server console, because the person who has to
     * scan it is standing at the front desk in a clinic you are not in.
     */
    qr?: string;
    lastError?: string;
    /**
     * `config.whatsapp.dryRun` — reminders are logged, not sent. Surfaced
     * because a connected socket that silently sends nothing looks identical to
     * a working one, and that is a demo-day trap.
     */
    dryRun: boolean;
}
