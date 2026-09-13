// A prod build that still probes the wifi, or still offers the demo, is the
// failure this guards: both are silent on a clinic phone until someone notices
// the fake register or the half-second lost on every reconnect.
import { describe, expect, it } from 'bun:test';
import { allowsDemo, allowsLan, usableAddresses, variantOf } from './variant';

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
});
