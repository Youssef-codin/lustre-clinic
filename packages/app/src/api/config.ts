import { TRPC_ENDPOINT, WS_PATH } from '@mawid/shared';
import Constants from 'expo-constants';

/**
 * Where the server is, and how long we are willing to wait for it (SPEC §14).
 *
 * The server is a PC in the clinic behind Tailscale, so its address is not a
 * property of the build — it differs between a dev machine and the clinic, and
 * the clinic itself has two of them. This file is the only place any of that is
 * written down.
 *
 * Two addresses, tried in order:
 *
 *   1. the LAN address, when the phone is on the clinic wifi — direct, no relay
 *   2. the MagicDNS hostname — works from anywhere on the tailnet
 *
 * Both are configured during onboarding (§6, §14), which calls
 * `setServerAddresses`. `app.json`'s `extra.server` is the default the app boots
 * with: the clinic's real addresses in a release build, a dev machine's in
 * development. Onboarding is what persists a change across launches; this module
 * deliberately holds no storage of its own.
 */

export interface ServerAddresses {
    /** e.g. `http://192.168.1.20:3000`. Null when the clinic has no fixed LAN address. */
    lan: string | null;
    /** e.g. `http://clinic-pc.tailnet-1234.ts.net:3000`. */
    tailscale: string | null;
}

interface ServerExtra {
    server?: Partial<ServerAddresses>;
}

/** No trailing slash, so `${base}${TRPC_ENDPOINT}` is always well formed. */
function normalize(address: string | null | undefined): string | null {
    const trimmed = address?.trim().replace(/\/+$/, '');
    return trimmed ? trimmed : null;
}

const extra = (Constants.expoConfig?.extra ?? {}) as ServerExtra;

let addresses: ServerAddresses = {
    lan: normalize(extra.server?.lan),
    tailscale: normalize(extra.server?.tailscale),
};

export function serverAddresses(): ServerAddresses {
    return addresses;
}

/**
 * Onboarding's entry point. Replaces both addresses and drops the resolved
 * base URL, so the next request probes again rather than talking to the old
 * machine. Persisting them is the caller's job.
 */
export function setServerAddresses(next: Partial<ServerAddresses>): void {
    addresses = {
        lan: normalize(next.lan ?? addresses.lan),
        tailscale: normalize(next.tailscale ?? addresses.tailscale),
    };
}

/**
 * Every number the client waits on. They add up to what an unreachable clinic
 * costs the user: a probe of both addresses (0.5s + 3s), then one request that
 * times out (5s), then a single retry (§14 — reads retry, writes never do).
 * Roughly ten seconds to a definite "the server is not there", which is the
 * point — a spinner that hangs for a minute reads as a broken app.
 */
export const timing = {
    /** §14: the LAN attempt is short. If the phone is not on clinic wifi it fails fast. */
    lanProbeMs: 500,
    /** The tailnet may relay, so its probe gets longer. */
    tailscaleProbeMs: 3_000,
    /** Cap on a real request once an address has answered. */
    requestMs: 5_000,
    /** Backoff between reconnect attempts while the server is unreachable. */
    reconnectMinMs: 2_000,
    reconnectMaxMs: 30_000,
    /**
     * How long after the last successful exchange the screen is treated as
     * showing stale data. Matches the query `staleTime`: past this, what is on
     * screen was true two minutes ago and the indicator says so (§7.14).
     */
    staleAfterMs: 120_000,
} as const;

export function trpcUrl(base: string): string {
    return `${base}${TRPC_ENDPOINT}`;
}

export function wsUrl(base: string): string {
    return `${base.replace(/^http/, 'ws')}${WS_PATH}`;
}
