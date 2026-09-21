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
import { clampToOutstanding, formatMoney, isWholePounds, paymentReceipt, toPounds } from './components/money';
import { errorText } from './data/errors';
import { PatientsRequestError } from './data/requestError';
import type { CustomQuestion, Patient } from './data/types';
import type { OldProcedureDraft, PatientForm } from './patientForm';
import {
    answeredCount,
    badOldDates,
    birthDateOf,
    blankBasics,
    blankOld,
    clearedRequired,
    createInputOf,
    EMPTY_OLD,
    emptyForm,
    formOf,
    isUnchanged,
    malformedBasics,
    malformedOld,
    missingRequired,
    oldDateDigits,
    oldDateError,
    owesInput,
    owesPiastres,
    unaskableRequired,
    updateInputOf,
} from './patientForm';

const question = (over: Partial<CustomQuestion> = {}): CustomQuestion => ({
    id: 'q',
    key: 'k',
    label: 'Question',
    labelAr: null,
    kind: 'text',
    options: null,
    required: false,
    sortOrder: 0,
    active: true,
    ...over,
});

const patient = (over: Partial<Patient> = {}): Patient => ({
    id: '11111111-1111-1111-1111-111111111111',
    ref: 'W5F5',
    name: 'Nour El-Sayed',
    phone: '+201002248891',
    email: null,
    birthDate: '1992-03-14',
    gender: 'female',
    custom: {},
    notes: null,
    legacyRef: null,
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
    old: EMPTY_OLD,
    ...over,
});

/** The old-patient block, switched on and filled the way the desk would fill it. */
const oldOn = (over: Partial<PatientForm['old']> = {}): PatientForm['old'] => ({
    on: true,
    ref: '710',
    owes: '',
    procedures: [],
    ...over,
});

const oldProcedure = (over: Partial<OldProcedureDraft> = {}): OldProcedureDraft => ({
    id: 'old-1',
    procedureId: '22222222-2222-2222-2222-222222222222',
    name: 'Checkup',
    tooth: null,
    dateDigits: '',
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
        expect(formatMoney(260000, { language: 'ar' })).toBe('2,600 ج.م');
    });

    it('rounds a negative amount the same way as its positive twin, and keeps the sign', () => {
        expect(formatMoney(-250)).toBe('EGP -3');
        expect(formatMoney(250)).toBe('EGP 3');
        expect(formatMoney(-40)).toBe('EGP 0');
    });
});

/**
 * The payment sheet's entry rules. Everything else about a payment — how it
 * splits, whether it is allowed — is the server's; this is only what stands
 * between the keypad and the wire.
 */
describe('taking a payment — what the field accepts', () => {
    it('accepts digits and an empty field', () => {
        expect(isWholePounds('6000')).toBe(true);
        expect(isWholePounds('')).toBe(true);
    });

    it('refuses a decimal rather than reinterpreting it', () => {
        expect(isWholePounds('12.50')).toBe(false);
        expect(isWholePounds('12.')).toBe(false);
        expect(isWholePounds('12,50')).toBe(false);
        // Arabic-Indic digits: §7.11 keeps numerals Latin in both languages.
        expect(isWholePounds('١٢')).toBe(false);
        expect(isWholePounds('-5')).toBe(false);
        expect(isWholePounds('1e3')).toBe(false);
    });

    it('would have overcharged a hundredfold under the old strip-the-dot rule', () => {
        const stripped = Number('12.50'.replace(/[^0-9]/g, ''));
        expect(stripped).toBe(1250);
        expect(clampToOutstanding(stripped, 500_000)).toBe(125_000);
        expect(isWholePounds('12.50')).toBe(false);
    });

    it('shows the amount due as the nearer pound', () => {
        expect(toPounds(955_000)).toBe(9_550);
        expect(toPounds(12_050)).toBe(121);
    });

    /**
     * The clamp is against piastres, never the pound figure on screen. An
     * outstanding of 12,050 displays as a due of 121 pounds, and 121 pounds is
     * 50 piastres more than is owed — which `balance.settle` now refuses
     * outright rather than quietly accepting.
     */
    it('never sends more than the real balance, even when the display rounds up', () => {
        expect(clampToOutstanding(121, 12_050)).toBe(12_050);
        expect(clampToOutstanding(60, 955_000)).toBe(6_000);
        expect(clampToOutstanding(9_550, 955_000)).toBe(955_000);
    });

    it('never produces a negative or fractional payment', () => {
        expect(clampToOutstanding(0, 955_000)).toBe(0);
        expect(clampToOutstanding(-10, 955_000)).toBe(0);
        expect(clampToOutstanding(Number.NaN, 955_000)).toBe(0);
        expect(clampToOutstanding(10.7, 955_000)).toBe(1_000);
    });

    // The strip is absent at zero, so the sheet cannot be opened here — this is
    // the belt to that brace, and `balance.settle` refuses it a third time.
    it('allows nothing against a patient who owes nothing', () => {
        expect(clampToOutstanding(500, 0)).toBe(0);
    });
});

/**
 * The paper book is one page per patient, so the desk posts one line against one
 * page: what came in, and what is left. The confirmation says exactly that and
 * names no visits — the per-visit split is the server's bookkeeping and matches
 * nothing anyone is holding.
 */
describe('what a recorded payment says it did', () => {
    it('says what came in and what is still owed', () => {
        expect(paymentReceipt({ amount: 600_000, outstandingAfter: 355_000 })).toBe(
            'EGP 6,000 recorded — EGP 3,550 still owed',
        );
    });

    // "EGP 0 still owed" is a true sentence nobody wants to read: closing a page
    // is a different mark from writing a balance on it.
    it('says paid in full rather than nothing owed', () => {
        expect(paymentReceipt({ amount: 955_000, outstandingAfter: 0 })).toBe(
            'EGP 9,550 recorded — paid in full',
        );
    });

    it('names no visit refs at all', () => {
        const line = paymentReceipt({ amount: 600_000, outstandingAfter: 355_000 });
        expect(line).not.toMatch(/\d{6}-/);
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

/**
 * The **Old patient** switch, and the one rule everything about it turns on:
 * off sends nothing. A number typed and then thought better of must not reach
 * the server, and the way it does not is that `createInputOf` leaves the whole
 * block out rather than sending a blank one.
 */
describe('the Old patient switch', () => {
    const questions: CustomQuestion[] = [];

    it('is off on a blank form, and sends no old block', () => {
        const form = emptyForm(questions);

        expect(form.old.on).toBe(false);
        expect(createInputOf(form, questions, TODAY)?.old).toBeUndefined();
    });

    it('sends the number on the file as the old ref when it is on', () => {
        const input = createInputOf(sound({ old: oldOn({ ref: '710' }) }), questions, TODAY);

        expect(input?.old?.ref).toBe('710');
    });

    // The reported case, from the form's side: what the screen sends for old
    // ref 710 has to be 710 and nothing else. The server keeps it as the
    // patient's ref, so a blank or a trimmed-away value here is the bug.
    it('sends 710 for a file marked 710', () => {
        const input = createInputOf(sound({ old: oldOn({ ref: ' 710 ' }) }), questions, TODAY);

        expect(input?.old?.ref).toBe('710');
    });

    it('sends nothing from the block once the switch goes back off', () => {
        const filled = sound({
            old: oldOn({ ref: '710', owes: '800', procedures: [oldProcedure()] }),
        });
        const off = { ...filled, old: { ...filled.old, on: false } };

        // The values are still on screen — a mis-tap that wiped them would be
        // worse — and none of them is in the payload.
        expect(off.old.ref).toBe('710');
        expect(createInputOf(off, questions, TODAY)?.old).toBeUndefined();
    });

    it('refuses a save while the switch is on and the number is blank', () => {
        const form = sound({ old: oldOn({ ref: '' }) });

        expect(blankOld(form)).toEqual(['ref']);
        expect(createInputOf(form, questions, TODAY)).toBeNull();
    });

    it('does not count the number as owed while the switch is off', () => {
        expect(blankOld(sound({ old: { ...oldOn({ ref: '' }), on: false } }))).toEqual([]);
    });

    it('takes a number that is not a number — that format is the old system’s', () => {
        const input = createInputOf(sound({ old: oldOn({ ref: 'A/1991-07' }) }), questions, TODAY);

        expect(input?.old?.ref).toBe('A/1991-07');
    });
});

describe('what an old patient owes', () => {
    const questions: CustomQuestion[] = [];

    it('takes whole pounds and sends integer piastres', () => {
        expect(owesPiastres('800')).toBe(80_000);
        expect(
            createInputOf(sound({ old: oldOn({ owes: '800' }) }), questions, TODAY)?.old?.openingBalance,
        ).toBe(80_000);
    });

    it('sends nothing at all for a blank or a zero — the absence of a balance is not one', () => {
        expect(owesPiastres('')).toBeNull();
        expect(owesPiastres('0')).toBeNull();

        const blank = createInputOf(sound({ old: oldOn({ owes: '' }) }), questions, TODAY);
        expect(blank?.old).toBeDefined();
        expect(blank?.old?.openingBalance).toBeUndefined();
    });

    // `12.50` read as `1250` is a hundredfold overcharge told to a patient
    // months later with no visit to check it against. The keypad has no decimal
    // key; a paste is the one way punctuation gets in, and it is refused
    // rather than reinterpreted.
    it('refuses punctuation rather than reading a separator as digits', () => {
        expect(owesInput('12.50')).toBe('12.50');
        expect(owesPiastres('12.50')).toBeNull();
        expect(owesPiastres('1,200')).toBeNull();
        expect(owesPiastres('abc')).toBeNull();

        const pasted = sound({ old: oldOn({ owes: '12.50' }) });
        expect(malformedOld(pasted).owes).toBeDefined();
        expect(createInputOf(pasted, questions, TODAY)).toBeNull();
    });

    it('refuses a figure that is a mis-key rather than a balance', () => {
        expect(owesPiastres('100001')).toBeNull();
        expect(malformedOld(sound({ old: oldOn({ owes: '100001' }) })).owes).toBeDefined();
        expect(createInputOf(sound({ old: oldOn({ owes: '100001' }) }), questions, TODAY)).toBeNull();
    });

    it('says nothing about an amount typed while the switch is off', () => {
        expect(malformedOld(sound({ old: { ...oldOn({ owes: '100001' }), on: false } }))).toEqual({});
    });
});

describe('old procedures', () => {
    const questions: CustomQuestion[] = [];

    it('sends zero, one, or several entries', () => {
        const none = createInputOf(sound({ old: oldOn() }), questions, TODAY);
        expect(none?.old?.procedures).toEqual([]);

        const three = createInputOf(
            sound({
                old: oldOn({
                    procedures: [
                        oldProcedure({ id: 'a' }),
                        oldProcedure({ id: 'b' }),
                        oldProcedure({ id: 'c' }),
                    ],
                }),
            }),
            questions,
            TODAY,
        );
        expect(three?.old?.procedures).toHaveLength(3);
    });

    it('sends the tooth when the entry carries one, and nothing when it does not', () => {
        const input = createInputOf(
            sound({
                old: oldOn({
                    procedures: [
                        oldProcedure({ id: 'a', tooth: 'UL6' }),
                        oldProcedure({ id: 'b', tooth: null }),
                    ],
                }),
            }),
            questions,
            TODAY,
        );

        expect(input?.old?.procedures[0]?.tooth).toBe('UL6');
        expect(input?.old?.procedures[1]?.tooth).toBeUndefined();
    });

    // Blank is the honest answer far more often than it looks: the paper file
    // says what was done and not always when. It goes as nothing, and the
    // record draws it as *before migration* rather than picking a day.
    it('leaves the date out when the file did not say when', () => {
        const input = createInputOf(
            sound({ old: oldOn({ procedures: [oldProcedure({ dateDigits: '' })] }) }),
            questions,
            TODAY,
        );

        expect(input?.old?.procedures[0]?.performedOn).toBeUndefined();
    });

    it('sends a typed date as an ISO day', () => {
        const input = createInputOf(
            sound({ old: oldOn({ procedures: [oldProcedure({ dateDigits: '14032024' })] }) }),
            questions,
            TODAY,
        );

        expect(input?.old?.procedures[0]?.performedOn).toBe('2024-03-14');
    });

    it('takes eight digits and strips the rest', () => {
        expect(oldDateDigits('14/03/2024')).toBe('14032024');
        expect(oldDateDigits('140320249')).toBe('14032024');
    });

    it('says nothing about a date still being typed, and does about one that is wrong', () => {
        expect(oldDateError('', '2026-09-20')).toBeNull();
        expect(oldDateError('1403', '2026-09-20')).toContain('Day, month and year');
        expect(oldDateError('32032024', '2026-09-20')).toContain('day that has happened');
        expect(oldDateError('14032099', '2026-09-20')).toContain('day that has happened');
        expect(oldDateError('14032024', '2026-09-20')).toBeNull();
    });
});

/**
 * A date typed into an old procedure and not readable. Blank is fine and
 * common — the paper file often does not say when — but a *wrong* date must
 * hold the save back, or the entry goes without one and the record shows
 * "Before migration" for a procedure the desk just dated.
 */
describe('a mistyped old procedure date', () => {
    const questions: CustomQuestion[] = [];

    it('does not hold the save back when it is simply blank', () => {
        const form = sound({ old: oldOn({ procedures: [oldProcedure({ dateDigits: '' })] }) });

        expect(badOldDates(form)).toEqual([]);
        expect(createInputOf(form, questions, TODAY)).not.toBeNull();
    });

    it('holds the save back on a half-typed date', () => {
        const form = sound({
            old: oldOn({ procedures: [oldProcedure({ id: 'half', dateDigits: '1403' })] }),
        });

        expect(badOldDates(form)).toEqual(['half']);
        expect(createInputOf(form, questions, TODAY)).toBeNull();
    });

    it('holds the save back on a day that is not one, or has not happened', () => {
        const impossible = sound({
            old: oldOn({ procedures: [oldProcedure({ id: 'feb31', dateDigits: '31022024' })] }),
        });
        expect(badOldDates(impossible)).toEqual(['feb31']);

        const future = sound({
            old: oldOn({ procedures: [oldProcedure({ id: 'later', dateDigits: '14032099' })] }),
        });
        expect(badOldDates(future)).toEqual(['later']);
        expect(createInputOf(future, questions, TODAY)).toBeNull();
    });

    it('says nothing about a bad date while the switch is off', () => {
        const off = sound({
            old: { ...oldOn({ procedures: [oldProcedure({ dateDigits: '1403' })] }), on: false },
        });

        expect(badOldDates(off)).toEqual([]);
        expect(createInputOf(off, questions, TODAY)).not.toBeNull();
    });
});
