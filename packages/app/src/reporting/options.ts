/**
 * Whether this build reports, and the SDK options that say what it collects.
 * Pure, so `bun test` reaches it; `reporting.ts` hands these to `Sentry.init`
 * along with the allow-list.
 *
 * The DSN is baked in at build time (`app.config.ts`, `LUSTRE_GLITCHTIP_DSN`)
 * and points at GlitchTip on the clinic server's MagicDNS name (§17). With no
 * DSN nothing is initialised at all, which is the state of every dev machine.
 * A demo build never reports: its patients are invented, and GlitchTip would
 * fill with crashes from a register nobody works in.
 */
import type { BuildVariant } from '../api/variant';

/**
 * The trail keeps about a hundred steps. The SDK is told twice that: on Android
 * each crumb reaches the event twice, once from JS and once from its native
 * copy, before `beforeSend` drops the copy (`privacy.ts`).
 */
export const TRAIL_LENGTH = 100;
export const MAX_BREADCRUMBS = TRAIL_LENGTH * 2;

export function dsnOf(extra: unknown): string | null {
    if (extra === null || typeof extra !== 'object') return null;
    const dsn = (extra as { glitchtipDsn?: unknown }).glitchtipDsn;
    if (typeof dsn !== 'string') return null;
    const trimmed = dsn.trim();
    return trimmed ? trimmed : null;
}

export function reportsFrom(dsn: string | null, variant: BuildVariant): boolean {
    return dsn !== null && variant !== 'demo';
}

export function sdkOptions(dsn: string | null, variant: BuildVariant) {
    const enabled = reportsFrom(dsn, variant);
    return {
        dsn: enabled ? (dsn ?? undefined) : undefined,
        enabled,
        environment: variant,
        sendDefaultPii: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
        // GlitchTip keeps no sessions and has thin tracing support (§17): errors only.
        enableAutoSessionTracking: false,
        enableAutoPerformanceTracing: false,
        enableUserInteractionTracing: false,
        enableCaptureFailedRequests: false,
        enableLogs: false,
        sampleRate: 1,
        maxBreadcrumbs: MAX_BREADCRUMBS,
    } as const;
}
