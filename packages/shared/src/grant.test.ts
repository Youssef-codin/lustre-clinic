import { describe, expect, it } from 'bun:test';
import { grantCodeOf, grantPayload, joinLinkOf, joinUrl } from './grant.ts';

const code = 'Abc-def_0123456789abcdefghij';

describe('reading a role code', () => {
    it('reads the bare code, the join page and the app link', () => {
        expect(grantCodeOf(grantPayload(code))).toBe(code);
        expect(grantCodeOf(joinUrl('http://clinic.tail1234.ts.net:3000/', code))).toBe(code);
        expect(grantCodeOf(`com.lustre.clinic://join?code=${code}`)).toBe(code);
    });

    it('refuses anything else a camera might see', () => {
        expect(grantCodeOf('https://example.com/menu')).toBeNull();
        expect(grantCodeOf(`https://example.com/other#${code}`)).toBeNull();
        expect(grantCodeOf('lustre-grant:v1:short')).toBeNull();
    });
});

describe('the join link', () => {
    it('carries the code and the server the page came from', () => {
        const link = `com.lustre.clinic://join?code=${code}&server=${encodeURIComponent('http://100.70.1.2:3000')}`;
        expect(joinLinkOf(link)).toEqual({ code, server: 'http://100.70.1.2:3000' });
    });

    it('drops a server that is not a web address', () => {
        expect(
            joinLinkOf(`com.lustre.clinic://join?code=${code}&server=javascript%3Aalert(1)`)?.server,
        ).toBeNull();
    });

    it('is not any other link into the app', () => {
        expect(joinLinkOf(`com.lustre.clinic://oauth2redirect?code=${code}`)).toBeNull();
    });
});
