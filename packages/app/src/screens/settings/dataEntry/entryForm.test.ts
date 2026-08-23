import { describe, expect, test } from 'bun:test';
import type { Cutoff, EntryForm } from './entryForm';
import {
    balanceDigits,
    balancePiastres,
    blankFields,
    blocks,
    cutoffDigitsOf,
    cutoffDisplay,
    cutoffError,
    cutoffIso,
    EMPTY_SESSION,
    emptyForm,
    enterInputOf,
    malformedFields,
    phoneDigits,
    recorded,
} from './entryForm';

/**
 * The decisions the data entry screen makes, without a renderer. The ones worth
 * pinning are the ones a mistake in is expensive rather than visible: money
 * read a hundredfold wrong, a balance written against no date, and a duplicate
 * that goes in silently.
 */

const CUTOFF: Cutoff = { branchId: 'branch-1', date: '2026-08-01', offsetMinutes: 180 };
const CLEAN = { duplicates: 0, acknowledged: false, cutoff: CUTOFF };
const TODAY = new Date('2026-08-23T09:00:00Z');

function form(patch: Partial<EntryForm> = {}): EntryForm {
    return { ...emptyForm(), name: 'Mariam Fouad', phone: '01012345678', ...patch };
}

describe('what a row must have', () => {
    test('a name and a number, and nothing else', () => {
        expect(blankFields(emptyForm())).toEqual(['name', 'phone']);
        expect(blankFields(form())).toEqual([]);
    });

    test('age, sex and balance are all skippable', () => {
        expect(blocks(form(), CLEAN)).toEqual([]);
    });

    test('a number too short to be one is refused', () => {
        expect(malformedFields(form({ phone: '010' })).phone).toBeDefined();
        expect(malformedFields(form({ phone: '+20 101 234 5678' })).phone).toBeUndefined();
    });
});

describe('money', () => {
    test('whole pounds in, integer piastres out', () => {
        expect(balancePiastres('800')).toBe(80_000);
        expect(balancePiastres('')).toBeNull();
    });

    // The reason the field takes digits only. `12.50` reaching the server as
    // 1250 pounds is a hundredfold overcharge on a row nobody can check.
    test('a separator never becomes a hundredfold overcharge', () => {
        expect(balanceDigits('12.50')).toBe('1250');
        expect(balancePiastres('12.50')).toBeNull();
    });

    test('zero is not a balance, and neither is a mis-key', () => {
        expect(balancePiastres('0')).toBeNull();
        expect(balancePiastres('999999')).toBeNull();
    });
});

describe('the cutoff', () => {
    test('a date is read day-first and sent ISO', () => {
        expect(cutoffIso('01082026', '2026-08-23')).toBe('2026-08-01');
        expect(cutoffDisplay('01082026')).toBe('01 / 08 / 2026');
        expect(cutoffDigitsOf('2026-08-01')).toBe('01082026');
    });

    test('a day that has not happened is not a cutoff', () => {
        expect(cutoffIso('01092026', '2026-08-23')).toBeNull();
        expect(cutoffError('01092026', '2026-08-23')).toBeDefined();
    });

    test('an impossible date is refused', () => {
        expect(cutoffIso('31022026', '2026-08-23')).toBeNull();
        expect(cutoffIso('29022024', '2026-08-23')).toBe('2024-02-29');
    });

    test('half typed says what is missing, empty says nothing', () => {
        expect(cutoffError('0108', '2026-08-23')).toBeDefined();
        expect(cutoffError('', '2026-08-23')).toBeNull();
    });

    // The server's schema refines exactly this. Finding out here costs nothing;
    // finding out over Tailscale costs a round trip and a row still on screen.
    test('a balance with no cutoff cannot be entered', () => {
        const owed = blocks(form({ balance: '800' }), { ...CLEAN, cutoff: null });
        expect(owed).toContain('cutoff');
        expect(enterInputOf(form({ balance: '800' }), { ...CLEAN, cutoff: null })).toBeNull();
    });

    test('no balance means no cutoff is needed', () => {
        expect(blocks(form(), { ...CLEAN, cutoff: null })).toEqual([]);
    });
});

describe('duplicates', () => {
    test('hold the save until the desk says they mean it', () => {
        const seen = { ...CLEAN, duplicates: 1 };
        expect(blocks(form(), seen)).toContain('duplicate');
        expect(blocks(form(), { ...seen, acknowledged: true })).toEqual([]);
    });
});

describe('what a save sends', () => {
    test('the whole row, with the balance and its date together', () => {
        const input = enterInputOf(form({ age: '34', gender: 'female', balance: '800' }), CLEAN, TODAY);

        expect(input).toEqual({
            name: 'Mariam Fouad',
            phone: '01012345678',
            legacyRef: null,
            birthDate: '1992-01-01',
            gender: 'female',
            offsetMinutes: 180,
            openingBalance: 80_000,
            branchId: 'branch-1',
            cutoffDate: '2026-08-01',
        });
    });

    // The old system's format is its own — refusing a real number for not
    // looking like a `ref` would refuse the only thing that matches the paper
    // file to the record.
    test('the old ref goes as typed, whatever shape it is', () => {
        expect(enterInputOf(form({ legacyRef: ' 4482 ' }), CLEAN, TODAY)?.legacyRef).toBe('4482');
        expect(enterInputOf(form({ legacyRef: 'A/1991-07' }), CLEAN, TODAY)?.legacyRef).toBe('A/1991-07');
    });

    test('a file with no number on it is still a patient', () => {
        expect(blocks(form({ legacyRef: '' }), CLEAN)).toEqual([]);
        expect(enterInputOf(form(), CLEAN, TODAY)?.legacyRef).toBeNull();
    });

    test('a skipped field goes as null, because there is nothing stored to keep', () => {
        const input = enterInputOf(form(), CLEAN, TODAY);
        expect(input?.birthDate).toBeNull();
        expect(input?.gender).toBeNull();
    });

    test('no balance sends no branch and no date', () => {
        const input = enterInputOf(form(), CLEAN, TODAY);
        expect(input && 'openingBalance' in input).toBe(false);
        expect(input && 'cutoffDate' in input).toBe(false);
    });

    test('nothing is sent while the row is incomplete', () => {
        expect(enterInputOf(emptyForm(), CLEAN, TODAY)).toBeNull();
    });
});

describe('the session tally', () => {
    test('counts every row, and the money only when it came with some', () => {
        const one = recorded(EMPTY_SESSION, 80_000);
        const two = recorded(one, null);

        expect(two).toEqual({ entered: 2, carried: 1, carriedTotal: 80_000 });
    });
});

describe('typing', () => {
    test('a phone keeps what a pasted international number needs', () => {
        // Brackets and dashes go; the leading `+` and the spacing the desk
        // typed stay, because the server normalizes both away anyway.
        expect(phoneDigits('+20 (101) 234-5678')).toBe('+20 101 2345678');
    });
});
