// What `patient-edit.html` is holding while it is open, and what a save sends.
// None of it is React, so all of it is tested without a renderer — the screen
// above is layout and the decisions live here.
//
// The form is one shape for both jobs the design gives the screen, registering
// someone and editing someone, because the two draw the same fields; what
// differs is only what a save sends. A create sends the whole form. An edit
// sends **only what changed** — the same rule the questionnaire already
// followed and for the same reason: `patient.update` validates only the keys it
// was given, so resubmitting a whole record would fail on a `select` option
// removed since the answer was recorded, and a record has to outlive the
// questionnaire it was filled in on.
//
// ## Age is stored as a date of birth
//
// The conversion itself is `domain/patientDraft` — it is the app's one lossy
// rule and three clusters were holding their own copy of it. What stays here is
// the guard, because it is about *this* screen's patch: `birthDate` is only ever
// sent when the age on screen differs from the age the record came with, so a
// patient whose real date of birth is on file (booked in through the day
// cluster, which asks for the date) never has it flattened to 1 January by an
// editor that was opened for their phone number. See `updateInputOf`.
//
// ## The Old patient switch
//
// Registering someone the clinic already had is the same screen with three more
// fields behind a switch: the number on their paper file, what they owed on it,
// and whatever the file records they had done. The switch is off by default,
// and *off means nothing is sent* — `createInputOf` leaves the whole `old`
// block out rather than sending a blank one, so a number typed and then thought
// better of does not reach the server. The fields keep their values while the
// switch is off, because a mis-tap that wiped them would be worse than one that
// did not, and only the submit reads the switch.
//
// The old ref is never validated for shape. That format is the old system's,
// not this one's, and refusing a real number for not looking like a `ref` would
// be refusing the only thing that matches a paper file to a record. The two
// refusals that do exist — a number another patient has, and one the new-patient
// sequence has still to hand out — are the server's, because only it can see
// the register.
//
// An old patient is never an *edit*: `old` is a registration block, and
// `updateInputOf` never sends it.
//
// ## The ref
//
// `ref` is the one field here that does not go through `patient.update`. It has
// a procedure of its own on the server because correcting the number a record is
// known by is a different act from correcting a phone number — it is gated by
// role and it leaves an audit row — so the form holds it, `refEditOf` says
// whether it moved, and the screen sends it separately.
//
// Unlike the *old* ref above, this one is validated for shape before it is
// sent: this format is ours. Both shapes stay valid, the plain counter number
// and the four-character code a patient registered before numbering carries —
// that code is still the number written on their file.

import { PATIENT_REF_PATTERN, PIASTRES_PER_POUND, type Tooth, todayKey } from '@lustre/shared';
import {
    birthDateOf,
    blankNameAndPhone,
    calendarIsoOf,
    malformedDraft,
    orNull,
} from '../../components/domain/patientDraft';
import type { Draft } from './components/customFields';
import { fromDraft, isAnswered, isEditable, toDraft } from './components/customFields';
import { isWholePounds } from './components/money';
import type {
    Answers,
    CreatePatientInput,
    CustomQuestion,
    OldPatientInput,
    Patient,
    UpdatePatientInput,
} from './data/types';

export {
    ageDigits,
    birthDateOf,
    dateDigitsDisplay as oldDateDisplay,
    FEMALE,
    MALE,
} from '../../components/domain/patientDraft';

/** `DDMMYYYY`, the same keypad rhythm the age-adjacent date fields already use. */
export const OLD_DATE_DIGITS = 8;

export function oldDateDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, OLD_DATE_DIGITS);
}

/**
 * A date that is typed but cannot be read. Half a date is a date still being
 * typed and says nothing; a complete one that is not a day, or is in the
 * future, is wrong and says so. Blank is not an error — it is the honest
 * *before migration, date unknown*.
 */
export function oldDateError(digits: string, today: string = todayKey()): string | null {
    if (digits.length === 0 || digits.length < OLD_DATE_DIGITS) {
        return digits.length === 0 ? null : 'Day, month and year — 01 / 08 / 2026.';
    }
    const iso = calendarIsoOf(digits);
    return iso === null || iso > today ? 'That has to be a day that has happened.' : null;
}

export type PatientForm = {
    name: string;
    phone: string;
    email: string;
    /**
     * This clinic's number for the patient. Empty while registering — the
     * number is the counter's to hand out, never the desk's to choose — and on
     * an edit it is the number already on the record.
     */
    ref: string;
    /** Whole years as digits, or `''` when the record carries no date of birth. */
    age: string;
    /** `''`, `'female'` or `'male'` — lowercase, the way every record already on file spells it. */
    gender: string;
    /** One entry per editable question, keyed by `custom_questions.key`. */
    answers: Draft;
    old: OldPatientForm;
};

/** One row in the old-procedures list, as the screen holds it before a save. */
export type OldProcedureDraft = {
    /** Local to the draft — the row does not exist server-side yet. */
    id: string;
    procedureId: string;
    /** As it is read out: "Composite filling — Class II". Display only; the id is what is sent. */
    name: string;
    tooth: Tooth | null;
    /** `DDMMYYYY` digits, or `''` — blank is *before migration, date unknown* and is sent as nothing. */
    dateDigits: string;
};

export type OldPatientForm = {
    /** Off by default. Off means nothing below is sent, whatever is in it. */
    on: boolean;
    /** The number on the paper file. Free text — see the note at the top. */
    ref: string;
    /** Whole pounds as digits, or `''` for a patient who owed nothing. */
    owes: string;
    procedures: OldProcedureDraft[];
};

export const EMPTY_OLD: OldPatientForm = { on: false, ref: '', owes: '', procedures: [] };

export function emptyForm(questions: CustomQuestion[]): PatientForm {
    return {
        name: '',
        phone: '',
        email: '',
        // A registration is numbered by the counter, so there is nothing to
        // hold and nothing this screen could put here.
        ref: '',
        age: '',
        gender: '',
        answers: blankAnswers(questions),
        old: EMPTY_OLD,
    };
}

export function formOf(patient: Patient, questions: CustomQuestion[]): PatientForm {
    const answers: Draft = {};
    for (const question of questions) answers[question.key] = toDraft(question, patient.custom[question.key]);

    return {
        name: patient.name,
        phone: patient.phone,
        email: patient.email ?? '',
        ref: patient.ref,
        // The server's own derivation, not a second one here.
        age: patient.age === null ? '' : String(patient.age),
        gender: patient.gender ?? '',
        answers,
        // An existing record is never registered again, so the switch has
        // nothing to do on an edit and the screen does not draw it.
        old: EMPTY_OLD,
    };
}

function blankAnswers(questions: CustomQuestion[]): Draft {
    const answers: Draft = {};
    for (const question of questions) answers[question.key] = '';
    return answers;
}

export type BasicsField = 'name' | 'phone' | 'email' | 'age';

/**
 * Required and still empty. These get the treatment the design gives an
 * unanswered required question — the label turns `due` and the footer counts it
 * — and never a message: "A patient needs a name" under an empty name field the
 * desk has not reached yet is telling them off for not having typed yet.
 */
export function blankBasics(form: PatientForm): BasicsField[] {
    return blankNameAndPhone(form);
}

/**
 * Typed, and wrong. The opposite case, so the opposite treatment: a message,
 * shown the moment it is true, because there is something on screen to correct
 * and waiting until Save is pressed hides it behind a button that will not move.
 */
export function malformedBasics(form: PatientForm): Partial<Record<BasicsField, string>> {
    return malformedDraft(form);
}

function basicsAreSound(form: PatientForm): boolean {
    return blankBasics(form).length === 0 && Object.keys(malformedBasics(form)).length === 0;
}

/** Which required questions have nothing in them — the design colours their labels and counts them on the button. */
export function missingRequired(form: PatientForm, questions: CustomQuestion[]): string[] {
    return questions
        .filter((question) => question.required && !isAnswered(form.answers[question.key] ?? ''))
        .map((question) => question.key);
}

/** The design's `N of M answered` — over every question drawn, required or not. */
export function answeredCount(form: PatientForm, questions: CustomQuestion[]): number {
    return questions.filter((question) => isAnswered(form.answers[question.key] ?? '')).length;
}

/**
 * Required questions this screen has no control for — today only `date` (§7.9).
 *
 * `validateIntake` requires an answer to *every* active required question, not
 * merely the ones the client can draw. So a clinic that marks a `date` question
 * required makes intake impossible here: the question renders read-only, nothing
 * can answer it, and every Save comes back `A required question was left blank.`
 * — an error naming a field the desk cannot see, let alone fill.
 *
 * Reported rather than worked around. The screen cannot register anyone until
 * either the question stops being required or `date` gets a control, and both of
 * those are someone's decision, not something to paper over with a save that is
 * guaranteed to fail.
 *
 * Intake only: `validatePatch` judges the keys it is sent, so an edit is free to
 * leave a question it cannot draw exactly as it found it.
 */
export function unaskableRequired(questions: CustomQuestion[]): CustomQuestion[] {
    return questions.filter((question) => question.required && !isEditable(question));
}

/**
 * Required questions the desk has just **emptied** — answered on the record that
 * arrived, blank on the form now.
 *
 * A required question left alone does not hold an edit back (see
 * `updateInputOf`), because a patch the server is never sent cannot fail its
 * validation. One that was cleared *is* sent, as the blank that means "delete
 * this answer", and `checkSubmitted` throws on a blank for an active required
 * question rather than deleting it. So the server refuses exactly this patch and
 * nothing else — and the button has to refuse it first, or Save reads
 * `Save patient`, spends the round trip, and comes back with a validation error
 * for a thing the screen let the desk do.
 *
 * This is the same rule the server applies, not a stricter one: never answered
 * and still unanswered stays saveable.
 */
export function clearedRequired(
    form: PatientForm,
    initial: PatientForm,
    questions: CustomQuestion[],
): string[] {
    return questions
        .filter(
            (question) =>
                question.required &&
                !isAnswered(form.answers[question.key] ?? '') &&
                isAnswered(initial.answers[question.key] ?? ''),
        )
        .map((question) => question.key);
}

function answersOf(form: PatientForm, questions: CustomQuestion[], only: (key: string) => boolean): Answers {
    const patch: Answers = {};
    for (const question of questions) {
        if (!only(question.key)) continue;
        patch[question.key] = fromDraft(question, form.answers[question.key] ?? '');
    }
    return patch;
}

// --- the old-patient block ------------------------------------------------

/**
 * What the field holds. Trimmed and capped, and *not* stripped to digits: a
 * pasted `12.50` has to stay `12.50` so that `malformedOld` can refuse it. The
 * old data-entry screen stripped, which read `12.50` as `1250` — a hundredfold
 * overcharge told to a patient months later with no visit to check it against,
 * and the one thing the field exists to not do. The keypad is `number-pad`, so
 * nothing but a paste ever gets punctuation in here.
 */
export function owesInput(text: string): string {
    return text.trim().slice(0, 8);
}

/** Above this and it is a mis-key, not a balance: a hundred thousand pounds owed by one patient. */
const LARGEST_OWED_EGP = 100_000;

/**
 * Whole pounds in, integer piastres out (§7.12), or null for anything that is
 * not whole pounds — a blank, a zero, punctuation, or a figure nobody owes.
 */
export function owesPiastres(pounds: string): number | null {
    const text = pounds.trim();
    if (text === '' || !isWholePounds(text)) return null;

    const value = Number(text);
    if (!Number.isInteger(value) || value <= 0 || value > LARGEST_OWED_EGP) return null;

    return value * PIASTRES_PER_POUND;
}

export type OldField = 'ref' | 'owes';

/**
 * Required and still empty, while the switch is on. Only the number: a patient
 * who owed nothing and had nothing recorded is most of them, and the switch is
 * about *which* patient this is rather than about what they bring with them.
 */
export function blankOld(form: PatientForm): OldField[] {
    if (!form.old.on) return [];
    return form.old.ref.trim() === '' ? ['ref'] : [];
}

/** Typed, and wrong — so a message, the moment it is true. */
export function malformedOld(form: PatientForm): Partial<Record<OldField, string>> {
    if (!form.old.on) return {};

    const owes = form.old.owes.trim();
    if (owes !== '' && owesPiastres(owes) === null) {
        return { owes: 'That is not an amount in pounds.' };
    }
    return {};
}

/**
 * Old procedures whose date has been typed and cannot be read — half a date, a
 * 31st of February, a day that has not happened.
 *
 * A blank date is not one of these: it is the honest *before migration*, and
 * most entries have it. A *wrong* one has to hold the save back, because the
 * alternative is silent — `calendarIsoOf` answers null, the entry goes without
 * a date, and the record shows "Before migration" for a procedure the desk just
 * dated. Returned as ids so the screen can count them; the message is already
 * under each row.
 */
export function badOldDates(form: PatientForm): string[] {
    if (!form.old.on) return [];
    return form.old.procedures
        .filter((entry) => oldDateError(entry.dateDigits) !== null)
        .map((entry) => entry.id);
}

function oldIsSound(form: PatientForm): boolean {
    return (
        blankOld(form).length === 0 &&
        Object.keys(malformedOld(form)).length === 0 &&
        badOldDates(form).length === 0
    );
}

/**
 * The block to send, or null when the switch is off. `performedOn` is left out
 * for an undated entry rather than sent as null: the record labels it *before
 * migration* and a blank date is the honest answer, not a missing one.
 *
 * No `offsetMinutes` rides with these dates, which every other date this app
 * sends does carry. They are a day being named rather than a day being bounded,
 * and the server stamps them at noon UTC so they read back as that day from any
 * offset this clinic can be in — see `migration.service`. It is also the only thing that *could*
 * work here: the opening balance is dated at a cutoff this form never sees, so
 * the offset in force on it is not something the form can know.
 */
function oldInputOf(form: PatientForm): OldPatientInput {
    const owes = owesPiastres(form.old.owes);

    return {
        ref: form.old.ref.trim(),
        ...(owes === null ? {} : { openingBalance: owes }),
        procedures: form.old.procedures.map((entry) => {
            const performedOn = calendarIsoOf(entry.dateDigits);
            return {
                procedureId: entry.procedureId,
                quantity: 1,
                ...(entry.tooth === null ? {} : { tooth: entry.tooth }),
                ...(performedOn === null ? {} : { performedOn }),
            };
        }),
    };
}

/**
 * The whole form, or null while it cannot be registered. Blank answers are left
 * out rather than sent as `''`: on intake the server takes what it is given and
 * a blank would only be deleted again on arrival.
 *
 * The `old` block is present only while the switch is on, so turning it off is
 * the whole of "prevents stale values from being submitted".
 */
export function createInputOf(
    form: PatientForm,
    questions: CustomQuestion[],
    today: Date = new Date(),
): CreatePatientInput | null {
    if (!basicsAreSound(form)) return null;
    if (missingRequired(form, questions).length > 0) return null;
    if (!oldIsSound(form)) return null;

    return {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: orNull(form.email),
        birthDate: birthDateOf(form.age, today),
        gender: orNull(form.gender),
        custom: answersOf(form, questions, (key) => isAnswered(form.answers[key] ?? '')),
        ...(form.old.on ? { old: oldInputOf(form) } : {}),
    };
}

/**
 * Only what moved. `birthDate` rides on the age *string* rather than on the
 * date it derives to, so an untouched field never rewrites a real date of birth
 * as 1 January (see the note at the top); everything else compares the value
 * the field will send, so retyping the same phone number is not a write.
 *
 * Required questions do **not** hold an edit back. `patient.update` validates
 * only the patch, deliberately, and blocking Save on a question nobody has
 * answered yet would stop the secretary fixing an unrelated one — which is the
 * whole reason the record can outlive its questionnaire.
 *
 * The one exception is a required answer the desk has *emptied*: that blank is
 * in the patch, and the server throws on it rather than deleting it. See
 * `clearedRequired`.
 */
export function updateInputOf(
    id: string,
    form: PatientForm,
    initial: PatientForm,
    questions: CustomQuestion[],
    today: Date = new Date(),
): UpdatePatientInput | null {
    if (!basicsAreSound(form)) return null;
    if (clearedRequired(form, initial, questions).length > 0) return null;

    const patch: UpdatePatientInput = { id };

    if (form.name.trim() !== initial.name.trim()) patch.name = form.name.trim();
    if (form.phone.trim() !== initial.phone.trim()) patch.phone = form.phone.trim();
    if (form.email.trim() !== initial.email.trim()) patch.email = orNull(form.email);
    if (form.gender !== initial.gender) patch.gender = orNull(form.gender);
    if (form.age.trim() !== initial.age.trim()) patch.birthDate = birthDateOf(form.age, today);

    const custom = answersOf(
        form,
        questions,
        (key) => (form.answers[key] ?? '').trim() !== (initial.answers[key] ?? '').trim(),
    );
    if (Object.keys(custom).length > 0) patch.custom = custom;

    return patch;
}

/** Whether a save would send anything at all — an editor closed unchanged should not spend a round trip. */
export function isUnchanged(patch: UpdatePatientInput): boolean {
    return Object.keys(patch).length === 1;
}

/**
 * A ref typed and wrong. Blank is its own case and says so, because a record
 * cannot be without a number and clearing the field is not a correction.
 *
 * The message names both shapes, since a desk looking at a patient from before
 * numbering is holding a paper file with `W5F5` on it and needs to be told that
 * is still allowed. Matching is case-insensitive and the server stores it
 * uppercase, so `w5f5` is accepted here rather than refused for its case.
 */
export function refError(ref: string): string | null {
    const trimmed = ref.trim();
    if (trimmed === '') return 'A patient keeps their number. Type the one on the file.';
    if (!PATIENT_REF_PATTERN.test(trimmed)) {
        return 'A number like 910, or the four-character code on an older file.';
    }
    return null;
}

/**
 * The ref's message while *editing*, which is not the same question `refError`
 * answers: a number only has to be one this app would issue if it is being
 * changed to.
 *
 * An old patient's ref is whatever their old system used — `A/1991-07` is a
 * real one — and it becomes their `ref` verbatim, because the desk was given
 * one number for them and must not be handed a second. `refError` refuses that
 * shape, correctly, for something being typed now. Judging the value already on
 * the record by it would lock the editor for every patient who came across:
 * Save would count one thing owed for a field nobody touched, and their phone
 * number could never be corrected again.
 */
export function refEditError(form: PatientForm, initial: PatientForm): string | null {
    if (form.ref.trim().toUpperCase() === initial.ref.trim().toUpperCase()) return null;
    return refError(form.ref);
}

/**
 * The ref to send, or null when there is nothing to send.
 *
 * Null covers three cases that all mean *do not call* — registering, a ref that
 * did not move, and one that is not sound — so the screen has one thing to ask
 * rather than three. Compared case-insensitively: the server stores `W5F5`, and
 * a desk retyping it as `w5f5` has not changed the record's number.
 */
export function refEditOf(form: PatientForm, initial: PatientForm): string | null {
    const next = form.ref.trim();
    if (next === '' || refError(next) !== null) return null;
    if (next.toUpperCase() === initial.ref.trim().toUpperCase()) return null;
    return next;
}
