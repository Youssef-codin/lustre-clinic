// The shell's two navigation rules, which is all of them that can be checked
// without a renderer: an ask has to be distinguishable from the one before it,
// and a home signal has to reach one tab without disturbing the other three.
import { describe, expect, it } from 'bun:test';
import { ask, bumpHome, isUnseen, NO_HOME } from './routes';

describe('a cross-cluster ask (SPEC §18 F3 — no navigator yet)', () => {
    it('starts at 1, so an untouched cluster reading 0 sees the first one', () => {
        expect(ask(undefined, { patientId: 'p1' })).toEqual({ patientId: 'p1', seq: 1 });
        expect(isUnseen(ask(undefined, { patientId: 'p1' }), 0)).toBe(true);
    });

    it('counts up, so the same patient asked for twice is two asks', () => {
        const first = ask(undefined, { patientId: 'p1' });
        const second = ask(first, { patientId: 'p1' });

        expect(second.seq).toBe(2);
        // What makes backing out of a record and tapping the same row again work.
        expect(isUnseen(second, first.seq)).toBe(true);
    });

    it('is seen once the cluster has acted on it', () => {
        const request = ask(undefined, { patientId: 'p1' });
        expect(isUnseen(request, request.seq)).toBe(false);
    });

    it('is nothing to act on when there has been no ask at all', () => {
        expect(isUnseen(undefined, 0)).toBe(false);
    });

    it('carries the destination through untouched', () => {
        expect(ask(undefined, { patient: { id: 'p1' }, timing: 'now' })).toEqual({
            patient: { id: 'p1' },
            timing: 'now',
            seq: 1,
        });
    });
});

describe('going home (tapping the tab you are already on)', () => {
    it('moves the tab that was tapped and leaves the rest where they are', () => {
        const next = bumpHome(NO_HOME, 'patients');

        expect(next).toEqual({ day: 0, patients: 1, money: 0, settings: 0 });
    });

    it('counts up, so a second tap is a second signal and not a no-op', () => {
        const twice = bumpHome(bumpHome(NO_HOME, 'day'), 'day');

        expect(twice.day).toBe(2);
    });

    it('keeps the four tabs independent', () => {
        const next = bumpHome(bumpHome(NO_HOME, 'money'), 'settings');

        expect(next).toEqual({ day: 0, patients: 0, money: 1, settings: 1 });
    });

    it('does not mutate what it was given — the clusters read the old one until they re-render', () => {
        bumpHome(NO_HOME, 'day');

        expect(NO_HOME.day).toBe(0);
    });
});
