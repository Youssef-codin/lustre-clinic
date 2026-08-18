// Setup writes down whatever `toBase` returns, and the app has no other way to
// find the clinic, so a value mangled here is a phone that never connects
// again. `bun test` has no renderer; this is the part of the screen that
// decides an address.
import { describe, expect, it } from 'bun:test';
import { noAnswer, toBase } from './address';

describe('toBase', () => {
    it('assumes http for a bare host, which is how the address is read aloud', () => {
        expect(toBase('192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
        expect(toBase('clinic-pc.tailnet.ts.net:3000')).toBe('http://clinic-pc.tailnet.ts.net:3000');
    });

    it('keeps a scheme the user typed, in either case', () => {
        expect(toBase('http://192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
        expect(toBase('https://clinic-pc.tailnet.ts.net')).toBe('https://clinic-pc.tailnet.ts.net');
        expect(toBase('HTTP://192.168.1.20:3000')).toBe('HTTP://192.168.1.20:3000');
    });

    it('strips trailing slashes, which `trpcUrl` would otherwise double', () => {
        expect(toBase('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000');
        expect(toBase('192.168.1.20:3000///')).toBe('http://192.168.1.20:3000');
    });

    it('survives the spaces a phone keyboard adds', () => {
        expect(toBase('  192.168.1.20:3000  ')).toBe('http://192.168.1.20:3000');
    });

    it('reports an empty field as empty rather than as a bare scheme', () => {
        expect(toBase('')).toBe('');
        expect(toBase('   ')).toBe('');
        expect(toBase('/')).toBe('');
    });
});

describe('noAnswer', () => {
    it('counts the addresses that were actually tried', () => {
        expect(noAnswer({ lan: 'http://a:3000', tailscale: 'http://b:3000' })).toStartWith(
            'Neither address answered',
        );
        expect(noAnswer({ lan: 'http://a:3000', tailscale: '' })).toStartWith('That address did not answer');
    });
});
