import { networkInterfaces } from 'node:os';
import type { Config } from '../config/index.ts';

/**
 * QR codes on printed paper point back at this machine, so the host in them has
 * to be resolved at print time from the real network — never hardcoded. Spec §9.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** True for the ranges a clinic LAN actually uses. */
function isPrivate(address: string): boolean {
    const [a = 0, b = 0] = address.split('.').map(Number);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
}

/**
 * The machine's LAN address. Private ranges are preferred over anything else —
 * a VPN or docker bridge address would be routable from nowhere the phone is.
 */
export function lanIp(): string | null {
    const candidates: string[] = [];

    for (const addresses of Object.values(networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family !== 'IPv4' || address.internal) continue;
            candidates.push(address.address);
        }
    }

    return candidates.find(isPrivate) ?? candidates[0] ?? null;
}

/**
 * Base URL for printed QR codes.
 *
 * The configured hostname wins: `http://mawid:8080` keeps working after a DHCP
 * change, and slips printed months ago are still in patients' hands. A detected
 * LAN IP is the fallback for an install where no hostname was set up — it works
 * today but goes stale the moment the router hands out a different lease, which
 * is why it is second choice rather than first.
 */
export function printBaseUrl(config: Config): string {
    const configured = config.hostname.trim();
    const host = LOOPBACK.has(configured) ? (lanIp() ?? configured) : configured;

    return `http://${host}:${config.server.port}`;
}

/** `/s/:ref` — what a scanned slip opens. See spec §9. */
export function scanUrl(config: Config, ref: string): string {
    return `${printBaseUrl(config)}/s/${encodeURIComponent(ref)}`;
}
