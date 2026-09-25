import { describe, expect, it } from 'bun:test';
import { isMinorUpdate, manifestVersion } from './updateGate';

describe('isMinorUpdate', () => {
    it('stops the phone for a new minor or major', () => {
        expect(isMinorUpdate('1.5.2', '1.6.0')).toBe(true);
        expect(isMinorUpdate('1.5.2', '2.0.0')).toBe(true);
    });

    it('leaves a patch to the next launch', () => {
        expect(isMinorUpdate('1.5.1', '1.5.2')).toBe(false);
        expect(isMinorUpdate('1.6.0', '1.6.3')).toBe(false);
    });

    it('never stops for an update that is not newer', () => {
        expect(isMinorUpdate('1.6.0', '1.5.9')).toBe(false);
        expect(isMinorUpdate('2.0.0', '1.9.0')).toBe(false);
    });

    // The quiet path cannot cost anyone a half-typed booking.
    it('treats a number it cannot read as a patch', () => {
        expect(isMinorUpdate(null, '1.6.0')).toBe(false);
        expect(isMinorUpdate('1.5.2', null)).toBe(false);
        expect(isMinorUpdate('0.0.0-dev', '1.6.0')).toBe(false);
    });
});

describe('manifestVersion', () => {
    it('reads the number the update was published as', () => {
        expect(manifestVersion({ id: 'x', metadata: { version: '1.6.0' } })).toBe('1.6.0');
    });

    it('is null for a manifest without one', () => {
        expect(manifestVersion({ id: 'x', metadata: {} })).toBeNull();
        expect(manifestVersion({ id: 'x' })).toBeNull();
        expect(manifestVersion(undefined)).toBeNull();
    });
});
