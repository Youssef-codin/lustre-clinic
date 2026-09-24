import { afterEach, describe, expect, it } from 'bun:test';
import { dateKey } from '@lustre/shared';
import { todayKey } from '../screens/day/time';
import { noteServerClock, serverNow, serverToday } from './serverClock';

const HOUR = 60 * 60_000;

describe('the server clock', () => {
    afterEach(() => noteServerClock(0));

    it('is the phone clock until the clock check has measured the skew', () => {
        expect(serverNow(1_000)).toBe(1_000);
    });

    it('takes the measured skew off a phone that runs fast', () => {
        noteServerClock(-HOUR);
        expect(serverNow(5 * HOUR)).toBe(4 * HOUR);
    });

    // A phone an hour fast reads 00:30 while the clinic is still at 23:30: the
    // day list, the day's keys and "today" labels all have to stay on yesterday.
    it('keeps today on the server side of midnight, for the day cluster too', () => {
        const phone = new Date();
        phone.setHours(0, 30, 0, 0);
        const clinic = new Date(phone.getTime() - HOUR);
        noteServerClock(clinic.getTime() - Date.now());

        expect(serverToday()).toBe(dateKey(clinic));
        expect(todayKey()).toBe(dateKey(clinic));
        expect(todayKey()).not.toBe(dateKey(phone));
    });
});
