// The cluster's logic lives in three places — money formatting, answer
// draft↔wire conversion, and patch semantics — and there is no renderer in
// `bun test`, so the components are verified on a device and this covers what
// would fail silently.
import { describe, expect, it } from 'bun:test';
import { displayAnswer, fromDraft, isEditable, toDraft, validateDraft } from './components/customFields';
import { formatMoney } from './components/money';
import { _LocalApiError, _LocalPatientsApi } from './data/_LocalPatientsApi';
import { errorText } from './data/errors';
import type { CustomQuestion } from './data/types';

const question = (over: Partial<CustomQuestion> = {}): CustomQuestion => ({
    id: 'q',
    key: 'k',
    label: 'Question',
    kind: 'text',
    options: null,
    required: false,
    sortOrder: 0,
    active: true,
    ...over,
});

describe('money (§7.12, §7.13)', () => {
    it('formats piastres as whole EGP', () => {
        expect(formatMoney(270000)).toBe('EGP 2,700');
        expect(formatMoney(0)).toBe('EGP 0');
        expect(formatMoney(142600000)).toBe('EGP 1,426,000');
    });

    it('never shows piastres', () => {
        expect(formatMoney(260050)).toBe('EGP 2,601');
    });

    it('trails the symbol in Arabic and keeps the numerals Latin', () => {
        expect(formatMoney(260000, 'ar')).toBe('2,600 ج.م');
    });

    it('rounds a negative amount the same way as its positive twin, and keeps the sign', () => {
        expect(formatMoney(-250)).toBe('EGP -3');
        expect(formatMoney(250)).toBe('EGP 3');
        expect(formatMoney(-40)).toBe('EGP 0');
    });
});

describe('errors (SPEC §14 — localise from the code, never the message)', () => {
    it('maps a known code to a fixed line and never shows the server text', () => {
        const text = errorText(new _LocalApiError('CUSTOM_QUESTION_REQUIRED', "'blood_type' is required"));
        expect(text).not.toContain('blood_type');
        expect(text).toBe('A required question was left blank.');
    });

    it('falls back for an unknown code and for a transport failure', () => {
        const unknown = errorText(new _LocalApiError('SOMETHING_NEW', 'internal detail'));
        expect(unknown).toBe(errorText(new TypeError('Network request failed')));
        expect(unknown).not.toContain('internal detail');
    });
});

describe('answers', () => {
    it('round-trips each editable kind', () => {
        const text = question({ kind: 'text' });
        expect(fromDraft(text, toDraft(text, 'Penicillin'))).toBe('Penicillin');

        const number = question({ kind: 'number' });
        expect(fromDraft(number, toDraft(number, 68))).toBe(68);

        const boolean = question({ kind: 'boolean' });
        expect(fromDraft(boolean, toDraft(boolean, false))).toBe(false);

        const select = question({ kind: 'select', options: ['O+', 'A+'] });
        expect(fromDraft(select, toDraft(select, 'A+'))).toBe('A+');
    });

    it('sends a cleared answer as the empty string, which the server deletes', () => {
        expect(fromDraft(question(), '   ')).toBe('');
    });

    it('refuses a blank required answer and a number that is not one', () => {
        expect(validateDraft(question({ required: true }), '')).not.toBeNull();
        expect(validateDraft(question({ required: false }), '')).toBeNull();
        expect(validateDraft(question({ kind: 'number' }), 'eight')).not.toBeNull();
    });

    it('refuses a select answer the question no longer offers', () => {
        const narrowed = question({ kind: 'select', options: ['AB+'] });
        expect(validateDraft(narrowed, 'AB')).not.toBeNull();
    });

    it('displays every kind, including the ones with no editor', () => {
        expect(displayAnswer(question({ kind: 'boolean' }), true)).toBe('Yes');
        expect(displayAnswer(question({ kind: 'boolean' }), false)).toBe('No');
        expect(displayAnswer(question({ kind: 'date' }), '2025-11-02')).toBe('2025-11-02');
        expect(displayAnswer(question(), '')).toBeNull();
    });

    it('leaves `date` out of the editable kinds until a control exists (§7.9)', () => {
        expect(isEditable(question({ kind: 'date' }))).toBe(false);
        for (const kind of ['text', 'number', 'boolean', 'select'] as const) {
            expect(isEditable(question({ kind }))).toBe(true);
        }
    });
});

describe('the record, against the local API', () => {
    it('hides deactivated questions but keeps their answers', async () => {
        const keys = (await _LocalPatientsApi.listQuestions()).map((q) => q.key);
        expect(keys).not.toContain('insurance_provider');

        const { patient } = await _LocalPatientsApi.byId('p-1');
        expect(patient.custom.insurance_provider).toBe('MedNet');
    });

    it('does not drop an unsent answer when saving a patch (§7.8)', async () => {
        const saved = await _LocalPatientsApi.update({ id: 'p-1', custom: { allergies: 'Latex' } });
        expect(saved.custom.allergies).toBe('Latex');
        expect(saved.custom.insurance_provider).toBe('MedNet');
        expect(saved.custom.blood_type).toBe('A+');
    });

    it('reports what a record is missing, and why', async () => {
        const never = await _LocalPatientsApi.byId('p-4');
        expect(never.questionnaireGaps.every((gap) => gap.reason === 'unanswered')).toBe(true);
        expect(never.questionnaireGaps.some((gap) => gap.required)).toBe(true);

        const stale = await _LocalPatientsApi.byId('p-6');
        expect(stale.questionnaireGaps).toContainEqual(
            expect.objectContaining({ key: 'blood_type', reason: 'answer_no_longer_valid' }),
        );
    });

    it('refuses to clear a required answer', async () => {
        expect(_LocalPatientsApi.update({ id: 'p-1', custom: { blood_type: '' } })).rejects.toThrow();
    });

    it('searches by name in either script, and by phone', async () => {
        expect((await _LocalPatientsApi.search('mariam')).map((p) => p.id)).toEqual(['p-2']);
        expect((await _LocalPatientsApi.search('ليلى')).map((p) => p.id)).toEqual(['p-9']);
        expect((await _LocalPatientsApi.search('0100123')).map((p) => p.id)).toEqual(['p-1']);
        expect(await _LocalPatientsApi.search('zzz')).toEqual([]);
    });
});
