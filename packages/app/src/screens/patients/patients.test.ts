// The cluster's logic lives in three places — money formatting, answer
// draft↔wire conversion, and patch semantics — and there is no renderer in
// `bun test`, so the components are verified on a device and this covers what
// would fail silently.
import { describe, expect, it } from 'bun:test';
import {
    displayAnswer,
    fromDraft,
    isAnswered,
    isEditable,
    NO,
    toDraft,
    YES,
} from './components/customFields';
import { formatMoney } from './components/money';
import { errorText } from './data/errors';
import { PatientsRequestError } from './data/requestError';
import type { CustomQuestion, Patient } from './data/types';
import type { PatientForm } from './patientForm';
import {
    answeredCount,
    birthDateOf,
    blankBasics,
    clearedRequired,
    createInputOf,
    emptyForm,
    formOf,
    isUnchanged,
    malformedBasics,
    missingRequired,
    unaskableRequired,
    updateInputOf,
} from './patientForm';

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

const patient = (over: Partial<Patient> = {}): Patient => ({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Nour El-Sayed',
    phone: '+201002248891',
    email: null,
    birthDate: '1992-03-14',
    gender: 'female',
    custom: {},
    notes: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    age: 34,
    ...over,
});

/** A form that would be accepted, so a test can break exactly one thing about it. */
const sound = (over: Partial<PatientForm> = {}): PatientForm => ({
    name: 'Nour El-Sayed',
    phone: '0100 224 8891',
    email: '',
    age: '34',
    gender: 'female',
    answers: {},
    ...over,
});

const TODAY = new Date('2026-08-17T09:00:00.000Z');

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
        const text = errorText(
            new PatientsRequestError('CUSTOM_QUESTION_REQUIRED', "'blood_type' is required"),
        );
        expect(text).not.toContain('blood_type');
        expect(text).toBe('A required question was left blank.');
    });

    it('falls back for an unknown code and for a transport failure', () => {
        const unknown = errorText(new PatientsRequestError('INTERNAL', 'internal detail', { offline: true }));
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

    // The reason a boolean draft is a string. `patient-edit.html` draws Yes/No
    // with neither half filled, and the record counts an absent key as a gap —
    // so "never asked" has to survive a round trip through the editor without
    // becoming "No".
    it('keeps a boolean question that was never asked apart from one answered no', () => {
        const yesno = question({ kind: 'boolean' });

        expect(toDraft(yesno, undefined)).toBe('');
        expect(toDraft(yesno, false)).toBe(NO);
        expect(toDraft(yesno, true)).toBe(YES);

        expect(isAnswered(toDraft(yesno, undefined))).toBe(false);
        expect(isAnswered(toDraft(yesno, false))).toBe(true);
    });

    it('counts a boolean answered no as answered, which is what the editor asks', () => {
        expect(isAnswered(toDraft(question({ kind: 'boolean' }), false))).toBe(true);
        expect(isAnswered(toDraft(question({ kind: 'boolean' }), ''))).toBe(false);
    });
});

describe('the patient form — age is a date of birth (BLOCKED.md)', () => {
    it('turns an age into the 1 January that reads back as it', () => {
        expect(birthDateOf('34', TODAY)).toBe('1992-01-01');
        expect(birthDateOf('0', TODAY)).toBe('2026-01-01');
    });

    it('refuses an age nobody has reached and a blank one', () => {
        expect(birthDateOf('', TODAY)).toBeNull();
        expect(birthDateOf('340', TODAY)).toBeNull();
        expect(malformedBasics(sound({ age: '340' })).age).toBeDefined();
        expect(malformedBasics(sound({ age: '' })).age).toBeUndefined();
    });

    it('reads the age off the record rather than deriving a second one', () => {
        const form = formOf(patient({ age: 41, birthDate: '1985-06-02' }), []);
        expect(form.age).toBe('41');
    });

    // The guard the whole approximation rests on: a record booked in through
    // the day cluster carries a real date of birth, and an editor opened to fix
    // a phone number must not flatten it to 1 January.
    it('never rewrites a real date of birth when the age was not touched', () => {
        const initial = formOf(patient({ age: 34, birthDate: '1992-03-14' }), []);
        const patch = updateInputOf('id', { ...initial, phone: '0100 000 0000' }, initial, [], TODAY);

        expect(patch?.phone).toBe('0100 000 0000');
        expect(patch && 'birthDate' in patch).toBe(false);
    });

    it('does send one when the age was corrected, and clears it when it was emptied', () => {
        const initial = formOf(patient({ age: 34 }), []);

        expect(updateInputOf('id', { ...initial, age: '35' }, initial, [], TODAY)?.birthDate).toBe(
            '1991-01-01',
        );
        expect(updateInputOf('id', { ...initial, age: '' }, initial, [], TODAY)?.birthDate).toBeNull();
    });
});

describe('the patient form — what a save sends', () => {
    const blood = question({ key: 'blood', kind: 'select', options: ['O+', 'A+'], required: true });
    const diabetic = question({ key: 'diabetic', kind: 'boolean' });
    const allergies = question({ key: 'allergies', kind: 'text' });
    const questions = [blood, diabetic, allergies];

    it('counts a blank name and number as owed, and says nothing about them', () => {
        const form = emptyForm(questions);
        expect(blankBasics(form)).toEqual(['name', 'phone']);
        expect(malformedBasics(form)).toEqual({});
    });

    it('complains about a number and an address only once they have been typed', () => {
        expect(malformedBasics(sound({ phone: '011' })).phone).toBeDefined();
        expect(malformedBasics(sound({ email: 'nour@' })).email).toBeDefined();
        expect(malformedBasics(sound({ email: '' })).email).toBeUndefined();
    });

    it('refuses to register anyone until every required question is answered', () => {
        const form = sound({ answers: { blood: '', diabetic: '', allergies: '' } });
        expect(missingRequired(form, questions)).toEqual(['blood']);
        expect(createInputOf(form, questions, TODAY)).toBeNull();

        const answered = { ...form, answers: { ...form.answers, blood: 'O+' } };
        expect(createInputOf(answered, questions, TODAY)).not.toBeNull();
    });

    it('leaves blank answers out of an intake rather than sending them as empty', () => {
        const form = sound({ answers: { blood: 'O+', diabetic: '', allergies: '' } });
        const input = createInputOf(form, questions, TODAY);

        expect(input?.custom).toEqual({ blood: 'O+' });
        expect(input?.email).toBeNull();
        expect(input?.birthDate).toBe('1992-01-01');
        expect(input?.gender).toBe('female');
    });

    it('sends only the answers that moved, so a stale option elsewhere cannot block the save', () => {
        const initial = formOf(
            patient({ custom: { blood: 'AB+', diabetic: false, allergies: 'Penicillin' } }),
            questions,
        );
        const form = { ...initial, answers: { ...initial.answers, allergies: 'None known' } };

        const patch = updateInputOf('id', form, initial, questions, TODAY);
        expect(patch?.custom).toEqual({ allergies: 'None known' });
    });

    // A required question nobody has answered is not the editor's business on an
    // edit: `patient.update` validates the patch alone, and holding an unrelated
    // correction hostage to it is what §7.8 exists to avoid.
    it('does not let an unanswered required question hold an edit back', () => {
        const initial = formOf(patient({ custom: {} }), questions);
        const form = { ...initial, phone: '0100 000 0000' };

        expect(missingRequired(form, questions)).toEqual(['blood']);
        expect(updateInputOf('id', form, initial, questions, TODAY)).not.toBeNull();
    });

    // `validateIntake` wants every *active required* question answered, not just
    // the ones this screen can draw. A required `date` therefore makes intake
    // impossible until it stops being required or gets a control (§7.9) — and
    // the screen has to say so rather than offer a Save that cannot work.
    it('spots a required question it has no control for, so intake fails legibly', () => {
        const asked = question({ key: 'last_visit', kind: 'date', required: true });

        expect(unaskableRequired([blood, diabetic, allergies, asked])).toEqual([asked]);
        expect(unaskableRequired([blood, diabetic, allergies])).toEqual([]);
    });

    it('does not call an optional question it cannot draw a blocker', () => {
        const optional = question({ key: 'last_visit', kind: 'date', required: false });
        expect(unaskableRequired([blood, optional])).toEqual([]);
    });

    // The server draws the line in `checkSubmitted`: a blank for an active
    // required question throws rather than deleting the answer. It only ever
    // sees the keys the patch carries, so "never answered" and "just emptied"
    // are different cases, and only the second one is refused.
    it('refuses to empty a required answer, because the server refuses that patch', () => {
        const initial = formOf(patient({ custom: { blood: 'O+' } }), questions);
        const form = { ...initial, answers: { ...initial.answers, blood: '' } };

        expect(clearedRequired(form, initial, questions)).toEqual(['blood']);
        expect(updateInputOf('id', form, initial, questions, TODAY)).toBeNull();
    });

    it('does not count a required question that was never answered as emptied', () => {
        const initial = formOf(patient({ custom: {} }), questions);
        const form = { ...initial, phone: '0100 000 0000' };

        expect(clearedRequired(form, initial, questions)).toEqual([]);
        expect(updateInputOf('id', form, initial, questions, TODAY)).not.toBeNull();
    });

    it('lets a required answer be changed, which is not the same as emptied', () => {
        const initial = formOf(patient({ custom: { blood: 'O+' } }), questions);
        const form = { ...initial, answers: { ...initial.answers, blood: 'A+' } };

        expect(clearedRequired(form, initial, questions)).toEqual([]);
        expect(updateInputOf('id', form, initial, questions, TODAY)?.custom).toEqual({ blood: 'A+' });
    });

    it('sends a cleared answer, and spends no round trip when nothing moved', () => {
        const initial = formOf(patient({ custom: { allergies: 'Penicillin' } }), questions);

        const cleared = updateInputOf(
            'id',
            { ...initial, answers: { ...initial.answers, allergies: '' } },
            initial,
            questions,
            TODAY,
        );
        expect(cleared?.custom).toEqual({ allergies: '' });

        const untouched = updateInputOf('id', initial, initial, questions, TODAY);
        expect(untouched).not.toBeNull();
        expect(untouched && isUnchanged(untouched)).toBe(true);
    });

    it('counts what the progress bar counts — every question with something in it', () => {
        const form = sound({ answers: { blood: 'O+', diabetic: NO, allergies: '' } });
        expect(answeredCount(form, questions)).toBe(2);
    });
});
