import { describe, expect, it } from 'bun:test';
import { STEP_SHIFT, stepDirection, stepOffset } from './stepTransition';

describe('stepDirection', () => {
    it('reads a higher index as forward and a lower one as back', () => {
        expect(stepDirection(0, 1)).toBe('forward');
        expect(stepDirection(2, 1)).toBe('back');
        expect(stepDirection(1, 1)).toBe('none');
    });
});

describe('stepOffset', () => {
    it('brings a forward step in from the inline end', () => {
        expect(stepOffset('forward', false)).toBe(STEP_SHIFT);
        expect(stepOffset('back', false)).toBe(-STEP_SHIFT);
    });

    it('mirrors in Arabic', () => {
        expect(stepOffset('forward', true)).toBe(-STEP_SHIFT);
        expect(stepOffset('back', true)).toBe(STEP_SHIFT);
    });

    it('does not move a step that did not change', () => {
        expect(stepOffset('none', false)).toBe(0);
        expect(stepOffset('none', true)).toBe(0);
    });
});
