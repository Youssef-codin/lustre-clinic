import { describe, expect, it } from 'bun:test';
import { clockProblem, clockSkew } from './clockCheck';

const CAIRO_SUMMER = 180;
const at = Date.parse('2026-09-24T15:00:00Z');
const server = { now: at, utcOffsetMinutes: CAIRO_SUMMER };
// A reading of both phone clocks. By default they agree: nobody set the time.
const sample = (wall: number, mono = wall) => ({ wall, mono });

describe('the phone clock check', () => {
    it('passes a phone that agrees with the server', () => {
        expect(clockProblem(server, sample(at - 200), sample(at + 200), CAIRO_SUMMER)).toBeNull();
    });

    it('lets a small drift through', () => {
        const phone = at - 90_000;
        expect(clockProblem(server, sample(phone), sample(phone), CAIRO_SUMMER)).toBeNull();
    });

    // The phone this was written for: winter time in September, and the clock
    // wound forward an hour so the status bar still read right.
    it('names the zone when the phone is on +2 in summer', () => {
        const phone = at + 60 * 60_000;
        expect(clockProblem(server, sample(phone), sample(phone), 120)).toEqual({ kind: 'zone' });
    });

    it('names the clock, and by how much, when only the clock is off', () => {
        const phone = at + 60 * 60_000;
        expect(clockProblem(server, sample(phone), sample(phone), CAIRO_SUMMER)).toEqual({
            kind: 'clock',
            offByMinutes: 60,
        });
        const slow = at - 7 * 60_000;
        expect(clockProblem(server, sample(slow), sample(slow), CAIRO_SUMMER)).toEqual({
            kind: 'clock',
            offByMinutes: 7,
        });
    });

    it('judges nothing off a reply too slow to place', () => {
        const phone = at + 60 * 60_000;
        expect(clockProblem(server, sample(phone), sample(phone + 45_000), CAIRO_SUMMER)).toBeNull();
    });
});

describe('the measured skew', () => {
    it('is the server clock less the midpoint of the round trip', () => {
        expect(clockSkew(at, sample(at + 60 * 60_000 - 100), sample(at + 60 * 60_000 + 100))).toBe(
            -60 * 60_000,
        );
    });

    // The phone's time set back an hour while the request was out: the round
    // trip comes out negative, and its midpoint would be half an hour wrong.
    it('is not taken from a round trip that ran backwards', () => {
        expect(clockSkew(at, sample(at + 60 * 60_000, 0), sample(at + 200, 200))).toBeNull();
    });

    // A smaller correction mid-request leaves a plausible round trip, but the
    // monotonic clock says the request took a different time.
    it('is not taken when the phone time moved during the request', () => {
        expect(clockSkew(at, sample(at, 0), sample(at + 20_000, 200))).toBeNull();
    });
});
