// Which kind of build this is, and what each kind may do. Pure, so `bun test`
// reaches it; `config.ts` supplies the inputs from the running build.
//
// The signal is `__DEV__`, not a value in `app.json`. Metro sets it false in
// every release bundle whatever the config says, so a clinic's APK cannot be a
// dev build by somebody forgetting to flip a flag. A release build that ships
// `extra.demo: true` is the demo handed to someone across a table, which is a
// deliberate build of its own and still not the clinic's app.
import type { ServerAddresses } from './config';

export type BuildVariant = 'dev' | 'demo' | 'prod';

export function variantOf(build: { dev: boolean; shippedDemo: boolean }): BuildVariant {
    if (build.dev) return 'dev';
    return build.shippedDemo ? 'demo' : 'prod';
}

// The clinic server listens only on Tailscale, and its firewall drops the API
// port from the wifi, so a LAN address can never answer a prod build. It would
// only cost a probe that always fails. Development keeps it: the emulator and a
// cable-attached phone reach the dev server through `localhost`.
export function allowsLan(variant: BuildVariant): boolean {
    return variant !== 'prod';
}

// Demo mode on a clinic phone is a fake register one tap from the real one.
export function allowsDemo(variant: BuildVariant): boolean {
    return variant !== 'prod';
}

// The shapes a tailnet address comes in: a MagicDNS name under `.ts.net`, an
// IPv4 address in Tailscale's 100.64.0.0/10 (the range the server itself checks
// `TAILSCALE_IP` against), or its fd7a:115c:a1e0::/48 IPv6 range. A bare short
// name is refused: it could as easily be the wifi router's name for the PC.
export function isTailnetAddress(address: string): boolean {
    const host = hostOf(address);
    if (host.endsWith('.ts.net') || host.startsWith('fd7a:115c:a1e0:')) return true;
    const octets = host.split('.');
    if (octets.length !== 4 || !octets.every((octet) => /^\d{1,3}$/.test(octet))) return false;
    const [first, second] = octets.map(Number);
    return first === 100 && second !== undefined && second >= 64 && second <= 127;
}

function hostOf(address: string): string {
    const rest = address
        .trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, '');
    const authority = rest.split(/[/?#]/)[0] ?? '';
    const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
    const bracketed = hostAndPort.match(/^\[([^\]]+)\]/);
    if (bracketed?.[1]) return bracketed[1];
    if ((hostAndPort.match(/:/g) ?? []).length > 1) return hostAndPort;
    return (hostAndPort.split(':')[0] ?? '').replace(/\.$/, '');
}

// On prod the Tailscale side must be a tailnet address too, however it arrived:
// typed into setup, restored from storage, shipped, or reported by the server.
// Otherwise the one field a prod build has is a way back onto the wifi.
export function usableAddresses(variant: BuildVariant, addresses: ServerAddresses): ServerAddresses {
    if (allowsLan(variant)) return addresses;
    const { tailscale } = addresses;
    return { lan: null, tailscale: tailscale && isTailnetAddress(tailscale) ? tailscale : null };
}
