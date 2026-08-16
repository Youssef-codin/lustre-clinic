/**
 * Who a booking is for, as the desk answers it: someone on file, or someone who
 * is not yet. The draft lives here rather than in `PatientPicker` because it
 * outlives the sheet that fills it — `BookingScreen` is still reading it long
 * after the picker unmounted — and because none of it is React, so all of it can
 * be tested without a renderer.
 *
 * A new patient owes a name and a number and nothing else (PRODUCT: booking must
 * beat the paper book). The rest of the record is offered because a secretary
 * who has the card in her hand should not have to open the record afterwards to
 * type what she is already reading — but every one of those fields is optional,
 * and a blank one is stored as `null`, never as an empty string.
 *
 * Date of birth is typed, not picked: a calendar is the wrong instrument for a
 * year forty years back, and she is reading digits off an ID card out loud. So
 * the field holds digits and nothing else and the slashes are drawn around them,
 * which makes an interrupted entry (`0511`) a legible half-answer rather than an
 * ambiguous date, and means the only thing that can reach the server is a whole,
 * real, past one.
 *
 * The checks here are the client's courtesy, not the authority: the server
 * validates the same fields and would refuse a bad one anyway. They exist so a
 * typo is caught while the patient is still on the phone.
 */
import type { Patient, PatientRef } from './data';
import { todayKey } from './time';

export type PatientDraft = {
    mode: 'existing' | 'new';
    term: string;
    picked: Patient | null;
    name: string;
    phone: string;
    email: string;
    /** Digits only, `DDMMYYYY` — never the display string, which is drawn from it. */
    birthDate: string;
    gender: string;
    notes: string;
};

export const EMPTY_PATIENT_DRAFT: PatientDraft = {
    mode: 'existing',
    term: '',
    picked: null,
    name: '',
    phone: '',
    email: '',
    birthDate: '',
    gender: '',
    notes: '',
};

/** Day, month, year — the order the card is read in. */
export const BIRTH_DATE_DIGITS = 8;

const EARLIEST_BIRTH_YEAR = 1900;

/** Deliberately loose. The server's is stricter; this one only catches the obvious. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Stored lowercase, the way every record already on file spells it. `''` is the way back out of a mis-tap. */
export const GENDERS: readonly { value: string; label: string }[] = [
    { value: '', label: 'Not recorded' },
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
];

export function birthDateDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, BIRTH_DATE_DIGITS);
}

/** What the field shows: the digits so far, with the separators the entry has earned. */
export function birthDateDisplay(digits: string): string {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);

    return [day, month, year].filter((part) => part.length > 0).join(' / ');
}

function daysInMonth(year: number, month: number): number {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return lengths[month - 1] ?? 0;
}

/** `YYYY-MM-DD` for the server, or null while the entry is incomplete or impossible. */
export function birthDateIso(digits: string, today: string = todayKey()): string | null {
    if (digits.length !== BIRTH_DATE_DIGITS) return null;

    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    if (year < EARLIEST_BIRTH_YEAR) return null;

    const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
    return iso > today ? null : iso;
}

/** What to say under the field, or null while there is nothing to correct. */
export function birthDateError(digits: string, today: string = todayKey()): string | null {
    if (digits.length === 0) return null;
    if (digits.length < BIRTH_DATE_DIGITS) return 'Day, month and year — 05 / 11 / 1990.';
    return birthDateIso(digits, today) === null ? 'That is not a date anyone was born on.' : null;
}

export function emailError(email: string): string | null {
    const value = email.trim();
    if (value.length === 0) return null;
    return EMAIL.test(value) ? null : 'That address is missing something.';
}

/** Blank means the question was not answered, and the record says so rather than storing an empty string. */
function detailOrNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * What the mutation takes, or null while the draft cannot be booked. Only the
 * name and the number can hold a booking back; a detail that is half-typed does
 * too, because sending it as blank would silently throw away what the secretary
 * was in the middle of writing.
 */
export function patientRefOf(draft: PatientDraft): PatientRef | null {
    if (draft.mode === 'existing') {
        return draft.picked ? { kind: 'existing', patientId: draft.picked.id } : null;
    }

    const name = draft.name.trim();
    const phone = draft.phone.trim();
    if (name.length === 0 || phone.length < 5) return null;
    if (emailError(draft.email) !== null || birthDateError(draft.birthDate) !== null) return null;

    return {
        kind: 'new',
        name,
        phone,
        email: detailOrNull(draft.email),
        birthDate: birthDateIso(draft.birthDate),
        gender: detailOrNull(draft.gender),
        notes: detailOrNull(draft.notes),
    };
}

/** What the booking page calls them — a new patient is named before they have an id. */
export function patientNameOf(draft: PatientDraft): string {
    return draft.mode === 'existing' ? (draft.picked?.name ?? '') : draft.name.trim();
}

export function patientPhoneOf(draft: PatientDraft): string {
    return draft.mode === 'existing' ? (draft.picked?.phone ?? '') : draft.phone.trim();
}

/** The way in for a screen that already knows the patient — the record's Book. */
export function draftFor(patient: Patient): PatientDraft {
    return { ...EMPTY_PATIENT_DRAFT, picked: patient };
}
