import { TRPC_ENDPOINT, WS_PATH } from '@mawid/shared';
import Constants from 'expo-constants';

// Server addressing lives entirely here (SPEC §14). The server is a PC in the
// clinic behind Tailscale, so the address is not a property of the build: try
// the LAN address first (direct, no relay, when the phone is on clinic wifi),
// then the MagicDNS hostname (anywhere on the tailnet). Both are configured
// during onboarding via `setServerAddresses`; `app.json` `extra.server` is the
// boot default, and this module deliberately holds no storage of its own.
//
// `normalize` takes `unknown` on purpose: an unconfigured address arrives as
// JSON `null` (or `{}` through the manifest), so a declared `string | null` is
// not one at runtime. The timing values sum to roughly ten seconds before a
// definite "the server is not there": a 0.5s LAN probe, a 3s tailnet probe, a
// 5s request cap, and reads retry once while writes never retry.
export interface ServerAddresses {
    lan: string | null;
    tailscale: string | null;
}

interface ServerExtra {
    server?: Partial<ServerAddresses>;
}

function normalize(address: unknown): string | null {
    if (typeof address !== 'string') return null;
    const trimmed = address.trim().replace(/\/+$/, '');
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

export function setServerAddresses(next: Partial<ServerAddresses>): void {
    addresses = {
        lan: normalize(next.lan ?? addresses.lan),
        tailscale: normalize(next.tailscale ?? addresses.tailscale),
    };
}

export const timing = {
    lanProbeMs: 500,
    tailscaleProbeMs: 3_000,
    requestMs: 5_000,
    reconnectMinMs: 2_000,
    reconnectMaxMs: 30_000,
    staleAfterMs: 120_000,
} as const;

export function trpcUrl(base: string): string {
    return `${base}${TRPC_ENDPOINT}`;
}

export function wsUrl(base: string): string {
    return `${base.replace(/^http/, 'ws')}${WS_PATH}`;
}
