import { describe, expect, test } from 'bun:test';
import { type Config, resolveTailnetAddress } from '../src/config.ts';

/**
 * `health.check` reports this and every phone stores it (§14), so a wrong
 * answer is not one bad response — it is a handset that cannot reach the clinic
 * from outside it, discovered by a secretary who is already somewhere else.
 */

function env(overrides: Partial<Config>): Config {
    return { PORT: 3000, ...overrides } as Config;
}

describe('resolveTailnetAddress', () => {
    test('prefers the MagicDNS name and gives it the port this process listens on', () => {
        expect(resolveTailnetAddress(env({ TAILSCALE_HOSTNAME: 'clinic-pc.tailnet.ts.net' }))).toBe(
            'http://clinic-pc.tailnet.ts.net:3000',
        );
    });

    test('keeps a port or scheme that was spelled out', () => {
        expect(resolveTailnetAddress(env({ TAILSCALE_HOSTNAME: 'clinic-pc.tailnet.ts.net:8080' }))).toBe(
            'http://clinic-pc.tailnet.ts.net:8080',
        );
        expect(resolveTailnetAddress(env({ TAILSCALE_HOSTNAME: 'https://clinic-pc.tailnet.ts.net' }))).toBe(
            'https://clinic-pc.tailnet.ts.net',
        );
    });

    test('falls back to the tailnet IP compose already needs', () => {
        expect(resolveTailnetAddress(env({ TAILSCALE_IP: '100.101.102.103' }))).toBe(
            'http://100.101.102.103:3000',
        );
    });

    test('refuses a bind address that is not a tailnet address', () => {
        // 0.0.0.0 is TAILSCALE_IP's dev default. It binds every interface and
        // dials none, so advertising it would store a dead address on a phone.
        expect(resolveTailnetAddress(env({ TAILSCALE_IP: '0.0.0.0' }))).toBeNull();
        expect(resolveTailnetAddress(env({ TAILSCALE_IP: '192.168.1.20' }))).toBeNull();
        // Just outside 100.64.0.0/10, which is public address space.
        expect(resolveTailnetAddress(env({ TAILSCALE_IP: '100.63.255.255' }))).toBeNull();
        expect(resolveTailnetAddress(env({ TAILSCALE_IP: '100.128.0.1' }))).toBeNull();
    });

    test('reports nothing when the clinic has not said, rather than guessing', () => {
        expect(resolveTailnetAddress(env({}))).toBeNull();
        expect(resolveTailnetAddress(env({ TAILSCALE_HOSTNAME: '   ' }))).toBeNull();
    });
});
