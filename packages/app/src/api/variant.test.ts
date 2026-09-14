// A prod build that still probes the wifi, or still offers the demo, is the
// failure this guards: both are silent on a clinic phone until someone notices
// the fake register or the half-second lost on every reconnect.
import { describe, expect, it } from 'bun:test';
import { allowsDemo, allowsLan, isTailnetAddress, usableAddresses, variantOf } from './variant';

describe('variantOf', () => {
    it('calls a release build with no shipped demo prod', () => {
        expect(variantOf({ dev: false, shippedDemo: false })).toBe('prod');
    });

    it('keeps a release build that ships the demo out of prod', () => {
        expect(variantOf({ dev: false, shippedDemo: true })).toBe('demo');
    });

    it('lets `__DEV__` win over a shipped demo flag', () => {
        expect(variantOf({ dev: true, shippedDemo: false })).toBe('dev');
        expect(variantOf({ dev: true, shippedDemo: true })).toBe('dev');
    });
});

describe('prod rules', () => {
    it('allows neither the LAN address nor demo mode', () => {
        expect(allowsLan('prod')).toBe(false);
        expect(allowsDemo('prod')).toBe(false);
    });

    it('keeps both for dev and demo builds', () => {
        for (const variant of ['dev', 'demo'] as const) {
            expect(allowsLan(variant)).toBe(true);
            expect(allowsDemo(variant)).toBe(true);
        }
    });

    it('drops a LAN address on prod, even one that is already set', () => {
        const saved = { lan: 'http://192.168.1.20:3000', tailscale: 'http://clinic.ts.net:3000' };
        expect(usableAddresses('prod', saved)).toEqual({ lan: null, tailscale: 'http://clinic.ts.net:3000' });
        expect(usableAddresses('dev', saved)).toEqual(saved);
    });

    it('drops a Tailscale address that is not on the tailnet, on prod only', () => {
        const wifi = { lan: null, tailscale: 'http://192.168.1.20:3000' };
        expect(usableAddresses('prod', wifi)).toEqual({ lan: null, tailscale: null });
        expect(usableAddresses('dev', wifi)).toEqual(wifi);
        expect(usableAddresses('demo', wifi)).toEqual(wifi);
    });
});

describe('isTailnetAddress', () => {
    it('accepts a MagicDNS name however it was typed', () => {
        expect(isTailnetAddress('http://smilemakers.tailad17f9.ts.net:3000')).toBe(true);
        expect(isTailnetAddress('smilemakers.tailad17f9.ts.net:3000')).toBe(true);
        expect(isTailnetAddress('HTTP://SMILEMAKERS.TAILAD17F9.TS.NET:3000/')).toBe(true);
    });

    it("accepts Tailscale's IPv4 range and nothing either side of it", () => {
        expect(isTailnetAddress('http://100.125.78.21:3000')).toBe(true);
        expect(isTailnetAddress('100.64.0.1')).toBe(true);
        expect(isTailnetAddress('100.127.255.255')).toBe(true);
        expect(isTailnetAddress('http://100.63.255.255:3000')).toBe(false);
        expect(isTailnetAddress('http://100.128.0.1:3000')).toBe(false);
    });

    it("accepts Tailscale's IPv6 range", () => {
        expect(isTailnetAddress('http://[fd7a:115c:a1e0::53]:3000')).toBe(true);
        expect(isTailnetAddress('http://[fd00::1]:3000')).toBe(false);
    });

    it('refuses the wifi, the emulator host and short names', () => {
        expect(isTailnetAddress('http://192.168.1.20:3000')).toBe(false);
        expect(isTailnetAddress('http://localhost:3000')).toBe(false);
        expect(isTailnetAddress('http://10.0.2.2:3000')).toBe(false);
        expect(isTailnetAddress('http://clinic-pc:3000')).toBe(false);
        expect(isTailnetAddress('')).toBe(false);
    });

    it('reads the host, not a lookalike in the path or the userinfo', () => {
        expect(isTailnetAddress('http://ts.net.evil.example:3000')).toBe(false);
        expect(isTailnetAddress('http://evil.example/clinic.ts.net')).toBe(false);
        expect(isTailnetAddress('http://clinic.ts.net@evil.example:3000')).toBe(false);
    });
});
