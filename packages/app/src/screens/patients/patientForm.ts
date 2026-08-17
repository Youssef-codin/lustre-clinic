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
// The design's basics row is `Age · sex` and holds a whole number. The server
// has no age column — `patients.birth_date` is the fact and `age` is derived
// from it at read time — so the number on screen is converted on the way out:
// an age of 34 becomes `1 January (this year − 34)`, which reads back as 34 for
// the whole of this year and as 35 next year. The patient does age, which is
// the point; what is lost is the day they age *on*, which is what a clinic that
// only ever asked "how old are you?" never knew either.
//
// The lossy half is guarded rather than accepted: `birthDate` is only ever sent
// when the age on screen differs from the age the record came with, so a
// patient whose real date of birth is on file (booked in through the day
// cluster, which asks for the date) never has it flattened to 1 January by an
// editor that was opened for their phone number. See BLOCKED.md.

import type { Draft } from './components/customFields';
import { fromDraft, isAnswered, toDraft } from './components/customFields';
import type { Answers, CreatePatientInput, CustomQuestion, Patient, UpdatePatientInput } from './data/types';

export type PatientForm = {
    name: string;
    phone: string;
    email: string;
    /** Whole years as digits, or `''` when the record carries no date of birth. */
    age: string;
    /** `''`, `'female'` or `'male'` — lowercase, the way every record already on file spells it. */
    gender: string;
    /** One entry per editable question, keyed by `custom_questions.key`. */
    answers: Draft;
};

/** Stored lowercase; the design's toggle is the two halves, and `''` is the way back out of a mis-tap. */
export const FEMALE = 'female';
export const MALE = 'male';

/** Nobody has been alive longer than this, and a typo like `340` should not reach the server. */
const OLDEST = 129;

/** Deliberately loose — the server's is stricter. This one only catches the obvious, while the patient is still at the desk. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A number is short enough to be a mis-tap rather than a phone number; the server refuses under 5 too. */
const SHORTEST_PHONE = 5;

export function emptyForm(questions: CustomQuestion[]): PatientForm {
    return { name: '', phone: '', email: '', age: '', gender: '', answers: blankAnswers(questions) };
}

export function formOf(patient: Patient, questions: CustomQuestion[]): PatientForm {
    const answers: Draft = {};
    for (const question of questions) answers[question.key] = toDraft(question, patient.custom[question.key]);

    return {
        name: patient.name,
        phone: patient.phone,
        email: patient.email ?? '',
        // The server's own derivation, not a second one here.
        age: patient.age === null ? '' : String(patient.age),
        gender: patient.gender ?? '',
        answers,
    };
}

function blankAnswers(questions: CustomQuestion[]): Draft {
    const answers: Draft = {};
    for (const question of questions) answers[question.key] = '';
    return answers;
}

export function ageDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, 3);
}

/** `''` for a field the desk left alone; the record says the question was not answered rather than storing blank. */
function orNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * 1 January of the year that makes the patient this old today. See the note at
 * the top of the file — the year is what the desk was told, the day is not.
 */
export function birthDateOf(age: string, today: Date = new Date()): string | null {
    const years = Number(age);
    if (age.trim() === '' || !Number.isInteger(years) || years < 0 || years > OLDEST) return null;
    return `${today.getFullYear() - years}-01-01`;
}

export type BasicsField = 'name' | 'phone' | 'email' | 'age';

/**
 * Required and still empty. These get the treatment the design gives an
 * unanswered required question — the label turns `due` and the footer counts it
 * — and never a message: "A patient needs a name" under an empty name field the
 * desk has not reached yet is telling them off for not having typed yet.
 */
export function blankBasics(form: PatientForm): BasicsField[] {
    const blank: BasicsField[] = [];
    if (form.name.trim().length === 0) blank.push('name');
    if (form.phone.trim().length === 0) blank.push('phone');
    return blank;
}

/**
 * Typed, and wrong. The opposite case, so the opposite treatment: a message,
 * shown the moment it is true, because there is something on screen to correct
 * and waiting until Save is pressed hides it behind a button that will not move.
 */
export function malformedBasics(form: PatientForm): Partial<Record<BasicsField, string>> {
    const found: Partial<Record<BasicsField, string>> = {};

    const phone = form.phone.trim();
    if (phone.length > 0 && phone.length < SHORTEST_PHONE) found.phone = 'That is too short to be a number.';

    const email = form.email.trim();
    if (email.length > 0 && !EMAIL.test(email)) found.email = 'That address is missing something.';

    if (form.age.trim() !== '' && birthDateOf(form.age) === null) found.age = 'That is not an age.';

    return found;
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

/**
 * The whole form, or null while it cannot be registered. Blank answers are left
 * out rather than sent as `''`: on intake the server takes what it is given and
 * a blank would only be deleted again on arrival.
 */
export function createInputOf(
    form: PatientForm,
    questions: CustomQuestion[],
    today: Date = new Date(),
): CreatePatientInput | null {
    if (!basicsAreSound(form)) return null;
    if (missingRequired(form, questions).length > 0) return null;

    return {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: orNull(form.email),
        birthDate: birthDateOf(form.age, today),
        gender: orNull(form.gender),
        custom: answersOf(form, questions, (key) => isAnswered(form.answers[key] ?? '')),
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
