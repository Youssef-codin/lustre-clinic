import { describe, expect, it } from 'bun:test';
import { clockProblem } from './clockCheck';

const CAIRO_SUMMER = 180;
const at = Date.parse('2026-09-24T15:00:00Z');

describe('the phone clock check', () => {
    it('passes a phone that agrees with the server', () => {
        expect(
            clockProblem({ now: at, utcOffsetMinutes: CAIRO_SUMMER }, at - 200, at + 200, CAIRO_SUMMER),
        ).toBeNull();
    });

    it('lets a small drift through', () => {
        const phone = at - 90_000;
        expect(
            clockProblem({ now: at, utcOffsetMinutes: CAIRO_SUMMER }, phone, phone, CAIRO_SUMMER),
        ).toBeNull();
    });

    // The phone this was written for: winter time in September, and the clock
    // wound forward an hour so the status bar still read right.
    it('names the zone when the phone is on +2 in summer', () => {
        const phone = at + 60 * 60_000;
        expect(clockProblem({ now: at, utcOffsetMinutes: CAIRO_SUMMER }, phone, phone, 120)).toEqual({
            kind: 'zone',
        });
    });

    it('names the clock, and by how much, when only the clock is off', () => {
        const phone = at + 60 * 60_000;
        expect(clockProblem({ now: at, utcOffsetMinutes: CAIRO_SUMMER }, phone, phone, CAIRO_SUMMER)).toEqual(
            {
                kind: 'clock',
                offByMinutes: 60,
            },
        );
        expect(
            clockProblem(
                { now: at, utcOffsetMinutes: CAIRO_SUMMER },
                at - 7 * 60_000,
                at - 7 * 60_000,
                CAIRO_SUMMER,
            ),
        ).toEqual({ kind: 'clock', offByMinutes: 7 });
    });

    it('judges nothing off a reply too slow to place', () => {
        const phone = at + 60 * 60_000;
        expect(
            clockProblem({ now: at, utcOffsetMinutes: CAIRO_SUMMER }, phone, phone + 45_000, CAIRO_SUMMER),
        ).toBeNull();
    });
});
