import { describe, expect, it } from 'bun:test';
import { canRecordProcedures } from './recording';

describe('who records procedures', () => {
    it('always lets the doctor', () => {
        expect(canRecordProcedures('doctor', 'doctor')).toBe(true);
        expect(canRecordProcedures('doctor', 'both')).toBe(true);
        expect(canRecordProcedures('doctor', undefined)).toBe(true);
    });

    it('lets the desk only when the clinic says both', () => {
        expect(canRecordProcedures('secretary', 'both')).toBe(true);
        expect(canRecordProcedures('secretary', 'doctor')).toBe(false);
    });

    it('treats a server without the setting as doctor only', () => {
        expect(canRecordProcedures('secretary', undefined)).toBe(false);
    });
});
