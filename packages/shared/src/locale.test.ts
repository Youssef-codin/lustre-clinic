import { describe, expect, it } from 'bun:test';
import { localizeCopy } from './locale.ts';

describe('localizeCopy', () => {
    it('isolates each value in Arabic, so a Latin name cannot turn the line left to right', () => {
        expect(
            localizeCopy('ar', '{procedure} · {minutes} min', { procedure: 'Consultation', minutes: 30 }),
        ).toBe('\u2068Consultation\u2069 · \u206830\u2069 دقيقة');
    });

    it('leaves English values as they are', () => {
        expect(
            localizeCopy('en', '{procedure} · {minutes} min', { procedure: 'Consultation', minutes: 30 }),
        ).toBe('Consultation · 30 min');
    });

    it('picks the Arabic form a count takes, which English does not have', () => {
        const days = (count: number) =>
            localizeCopy('ar', '{count} days', { count }).replace(/[\u2068\u2069]/g, '');
        expect(days(1)).toBe('يوم واحد');
        expect(days(2)).toBe('يومان');
        expect(days(4)).toBe('4 أيام');
        expect(days(13)).toBe('13 يومًا');
        expect(days(100)).toBe('100 يوم');
        expect(localizeCopy('en', '{count} days', { count: 4 })).toBe('4 days');
    });
});
