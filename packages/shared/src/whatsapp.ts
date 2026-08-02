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
    /**
     * `config.whatsapp.testNumber`, as the clinic wrote it. Present only when
     * one is configured — the desk hides the test button without it, because a
     * button that can only fail is worse than no button.
     */
    testNumber?: string;
}

/**
 * `POST /api/whatsapp/test` → `WhatsAppTestResult`
 *
 * Sends one message to the configured test number, down the same path a real
 * reminder takes. This is the only way to prove the link actually carries a
 * message: a socket reports `connected` long before anyone knows whether the
 * clinic's Arabic template arrives readable on a real handset.
 */
export interface WhatsAppTestResult {
    /** Normalized to E.164 — what was really messaged, not what was typed. */
    to: string;
    /** True when the message was logged rather than sent. Nothing arrived. */
    dryRun: boolean;
}
