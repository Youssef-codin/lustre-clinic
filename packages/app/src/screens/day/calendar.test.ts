// The calendar sheet is keyed on `seq`, so these two transitions decide whether
// a tap remounts a presented sheet. That is not something `bun test` can see —
// there is no renderer — but the rule that prevents it is arithmetic, and this
// is it.
import { describe, expect, it } from 'bun:test';
import { CALENDAR_CLOSED, closeCalendar, openCalendar } from './calendar';

describe('opening the calendar', () => {
    it('counts the opening, so the sheet remounts onto the day the screen is on', () => {
        expect(openCalendar(CALENDAR_CLOSED)).toEqual({ open: true, seq: 1 });
    });

    it('counts every opening, so reopening is a fresh month and not the last one', () => {
        const first = openCalendar(CALENDAR_CLOSED);
        const second = openCalendar(closeCalendar(first));

        expect(second.seq).toBe(2);
    });

    it('spends a tap that lands while the sheet is already up', () => {
        const open = openCalendar(CALENDAR_CLOSED);

        // Identity, not equality: React bails out of the render on `Object.is`,
        // which is what keeps a tap during the entrance from remounting a
        // presented sheet and playing the entrance a second time.
        expect(openCalendar(open)).toBe(open);
    });
});

describe('closing the calendar', () => {
    it('keeps the count, so the next opening is still distinguishable', () => {
        expect(closeCalendar(openCalendar(CALENDAR_CLOSED))).toEqual({ open: false, seq: 1 });
    });

    it('spends a close that lands on a sheet already down', () => {
        expect(closeCalendar(CALENDAR_CLOSED)).toBe(CALENDAR_CLOSED);
    });
});
