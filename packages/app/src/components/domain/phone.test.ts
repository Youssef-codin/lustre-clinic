import { describe, expect, it } from 'bun:test';
import { phoneText } from './phone';

describe('phoneText', () => {
    it('holds the number left to right, and changes nothing a reader can see', () => {
        expect(phoneText('+201004001008')).toBe('⁦+201004001008⁩');
        expect(phoneText('+201004001008').replace(/[⁦⁩]/g, '')).toBe('+201004001008');
    });
});
