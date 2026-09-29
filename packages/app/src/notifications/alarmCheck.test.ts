import { describe, expect, it } from 'bun:test';
import { alarmCheck } from './alarmCheck';

const base = {
    demo: false,
    current: null,
    lan: 'http://192.168.1.10:3000',
    tailscale: 'http://100.64.0.2:3000',
    today: '2026-09-27',
    offsetMinutes: 180,
};

describe('alarmCheck', () => {
    it('asks the address the app is on first, then the rest, once each', () => {
        const check = alarmCheck({ ...base, current: 'http://100.64.0.2:3000' });
        expect(check?.bases).toEqual(['http://100.64.0.2:3000', 'http://192.168.1.10:3000']);
    });

    it('asks for one reminder due by the end of the clinic day, and for the settings', () => {
        const check = alarmCheck(base);
        expect(check?.pendingPath).toBe(
            `/trpc/reminder.pending?input=${encodeURIComponent('{"dueOnly":true,"limit":1,"offsetMinutes":180,"throughToday":true}')}`,
        );
        expect(check?.settingsPath).toBe('/trpc/settings.get');
        expect(check?.today).toBe('2026-09-27');
    });

    it('has nothing to ask in demo mode, or with no server set up', () => {
        expect(alarmCheck({ ...base, demo: true })).toBeNull();
        expect(alarmCheck({ ...base, lan: null, tailscale: null })).toBeNull();
    });
});
