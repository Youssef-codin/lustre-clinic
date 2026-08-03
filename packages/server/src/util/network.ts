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
 * Interfaces that hold a private address the phone can never reach: docker and
 * libvirt bridges, VPN tunnels, container veth pairs. `isPrivate` alone does not
 * exclude them — docker0 sits on 172.17.0.1, squarely inside a private range —
 * so they are ranked last rather than filtered out, in case they are genuinely
 * all this machine has.
 */
const VIRTUAL = /^(docker|br-|veth|virbr|tailscale|tun|tap|wg|zt|utun|vmnet|vboxnet)/;

/** Real Wi-Fi and ethernet, on Linux/macOS/BSD naming. */
const PHYSICAL = /^(wl|en|eth|wlan|wifi)/;

function rank(name: string, address: string): number {
    if (!isPrivate(address)) return 3;
    if (VIRTUAL.test(name)) return 2;
    return PHYSICAL.test(name) ? 0 : 1;
}

/**
 * The machine's LAN address — the one a phone on the same network can open.
 *
 * Interface *name* matters as much as the address range here. A laptop running
 * docker has several private addresses, and enumeration order is not stable, so
 * picking the first private one prints a QR pointing at a container bridge maybe
 * half the time. Physical interfaces win, virtual ones are the last resort.
 */
export function lanIp(): string | null {
    const candidates: { address: string; rank: number }[] = [];

    for (const [name, addresses] of Object.entries(networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family !== 'IPv4' || address.internal) continue;
            candidates.push({ address: address.address, rank: rank(name, address.address) });
        }
    }

    candidates.sort((a, b) => a.rank - b.rank);

    return candidates[0]?.address ?? null;
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
