// What the dev strip says about the server, kept out of `DevBanner` so it can be
// tested without a React Native runtime — the same split `address.ts` makes.
import type { ServerAddresses } from '../api';

export const DEV_LABEL = 'DEV';

/**
 * The server this build is actually talking to, which is the half of the strip
 * that prevents the mix-up: two phones on a desk showing the same screen differ
 * only in the address behind it.
 *
 * The connected base URL is preferred over the configured one because they part
 * company — a dev build falls back from the LAN to the tailnet without being
 * told — and a build that has not reached anything yet says so rather than
 * naming an address it never answered on.
 */
export function serverLabel(connectedTo: string | null, addresses: ServerAddresses): string {
    const address = connectedTo ?? addresses.lan ?? addresses.tailscale;
    return address ? hostOf(address) : 'no server';
}

function hostOf(address: string): string {
    return address
        .trim()
        .replace(/^[a-z]+:\/\//i, '')
        .replace(/\/+$/, '');
}
