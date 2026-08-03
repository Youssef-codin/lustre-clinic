import { logger } from '../logger.ts';

/**
 * SPEC §17 — the app reporting its own failures: backup failed, database error,
 * unhandled exception. One POST to a Discord webhook; there is no bot to
 * register and no second service to keep running.
 *
 * Alerts carry IDs and error codes only, never patient data (§17). `scrub`
 * below is a backstop for that rule, not a licence to pass patient data in.
 *
 * Deduplicated and rate-limited, because the failure modes worth alerting on
 * are the ones that repeat — a database that is down is down for every query.
 */

/** Values allowed in an alert context: identifiers, codes, counts, flags. */
export type AlertValue = string | number | boolean | null;

export interface Alert {
    /** Stable machine-readable kind, e.g. `backup.failed`. Used for dedupe. */
    readonly code: string;
    /** One English line for a human reading the channel. No patient data. */
    readonly summary: string;
    readonly context?: Readonly<Record<string, AlertValue>>;
}

export type AlertSender = (alert: Alert, text: string) => Promise<void>;

export interface AlerterOptions {
    send: AlertSender;
    /** Identical codes are sent at most once per window. */
    dedupeWindowMs?: number;
    /** Hard ceiling on sends per window, whatever the code. */
    rateLimit?: { max: number; windowMs: number };
    now?: () => number;
}

const DEFAULT_DEDUPE_WINDOW_MS = 15 * 60_000;
const DEFAULT_RATE_LIMIT = { max: 20, windowMs: 60 * 60_000 };

/**
 * Context keys that may carry patient data. Mirrors the pino redaction list in
 * `logger.ts` — an alert is a log line that leaves the machine, so it gets at
 * least the same treatment.
 */
const FORBIDDEN_KEYS = new Set([
    'name',
    'phone',
    'email',
    'note',
    'notes',
    'custom',
    'amount',
    'total',
    'chargedTotal',
    'computedTotal',
    'birthDate',
]);

export function scrub(context: Readonly<Record<string, AlertValue>>): Record<string, AlertValue> {
    const out: Record<string, AlertValue> = {};
    for (const [key, value] of Object.entries(context)) {
        out[key] = FORBIDDEN_KEYS.has(key) ? '[redacted]' : value;
    }
    return out;
}

export function formatAlert(alert: Alert, context: Record<string, AlertValue>): string {
    const fields = Object.entries(context)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
    const head = `**${alert.code}** — ${alert.summary}`;
    return fields ? `${head}\n\`${fields}\`` : head;
}

export interface Alerter {
    /** Never throws and never rejects: alerting must not break the caller. */
    report(alert: Alert): Promise<void>;
}

export function createAlerter(options: AlerterOptions): Alerter {
    const {
        send,
        dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS,
        rateLimit = DEFAULT_RATE_LIMIT,
        now = Date.now,
    } = options;

    /** Last send time per code, for dedupe. */
    const lastSent = new Map<string, number>();
    /** Send timestamps inside the current rate-limit window. */
    let sentAt: number[] = [];
    /** Set while suppressing, so the ceiling notice is announced exactly once. */
    let ceilingAnnounced = false;

    async function deliver(alert: Alert): Promise<void> {
        const text = formatAlert(alert, scrub(alert.context ?? {}));
        try {
            await send(alert, text);
        } catch (err) {
            // Nothing left to escalate to — the alert channel is the escalation.
            logger.error({ err, alertCode: alert.code }, 'alert delivery failed');
        }
    }

    return {
        async report(alert: Alert): Promise<void> {
            const at = now();

            const previous = lastSent.get(alert.code);
            if (previous !== undefined && at - previous < dedupeWindowMs) {
                logger.debug({ alertCode: alert.code }, 'alert deduplicated');
                return;
            }

            sentAt = sentAt.filter((t) => at - t < rateLimit.windowMs);
            if (sentAt.length >= rateLimit.max) {
                if (!ceilingAnnounced) {
                    ceilingAnnounced = true;
                    logger.warn({ alertCode: alert.code }, 'alert rate limit reached, suppressing');
                    await deliver({
                        code: 'monitoring.rate_limited',
                        summary: 'Alert rate limit reached. Further alerts are suppressed for now.',
                        context: { max: rateLimit.max, windowMinutes: rateLimit.windowMs / 60_000 },
                    });
                }
                return;
            }

            ceilingAnnounced = false;
            lastSent.set(alert.code, at);
            sentAt.push(at);
            await deliver(alert);
        },
    };
}

/** Posts to a Discord webhook. `content` is the whole message; no embeds. */
export function discordSender(webhookUrl: string): AlertSender {
    return async (_alert, text) => {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: text }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            throw new Error(`discord webhook responded ${res.status}`);
        }
    };
}

/** Used when `DISCORD_WEBHOOK_URL` is unset — the alert is logged and dropped. */
export const noopSender: AlertSender = async (alert, text) => {
    logger.warn({ alertCode: alert.code, text }, 'alert (no webhook configured)');
};
