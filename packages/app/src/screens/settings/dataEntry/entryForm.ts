// What the data entry screen is holding, and what a submit sends. No React, so
// all of it is tested without a renderer — the screen above is layout.
//
// This is not the patient editor with fewer fields. The editor registers one
// patient properly: the whole questionnaire, every required question enforced
// on intake. This is a list being retyped — hundreds of rows, name and number
// off a screen nobody can export from — so the only two things it insists on
// are the two a patient cannot be without, and the questionnaire is not asked
// at all. The server agrees: `migration.enter` writes through `createMinimal`,
// the same path booking uses when the secretary is on the phone and the
// questions are answered later at the desk.
//
// ## What is deliberately shared, and what is not
//
// The field-level rules come from `domain/patientDraft` — the lossy age
// conversion above all, which is the one place in the app where what the desk
// typed is not what is stored. This screen used to reach across to
// `patients/patientForm` for them, which was the first cross-cluster import in
// `screens/` and broke the rule SPEC §10 exists to enforce.
//
// Everything else here is this screen's own, because the rules genuinely
// differ: no email, no notes, no questionnaire, and a field the editor has
// never had — what the patient owed before the cutoff.
//
// ## Money
//
// Whole pounds in, integer piastres out (§7.12). The field takes digits only:
// `ui/NumericField` hardcodes `decimal-pad`, and stripping a separator would
// read `12.50` as `1250` — a hundredfold overcharge, which on a migration is
// a hundredfold overcharge told to a patient months later with no visit to
// check it against.
import { daysInMonth, todayKey } from '@lustre/shared';
import { ageError, birthDateOf, orNull, phoneError } from '../../../components/domain/patientDraft';

export { ageDigits, FEMALE, MALE } from '../../../components/domain/patientDraft';

export type EntryForm = {
    /**
     * The number the old system knew this patient by, read off the paper file.
     * Never validated for shape: it is that system's format, not this one's, and
     * refusing a real number for not looking like a `ref` would be refusing the
     * only thing that matches the file to the record. Optional, because a file
     * without a number on it is still a patient.
     */
    legacyRef: string;
    name: string;
    phone: string;
    /** Whole years as digits, or `''`. Written out as a date of birth — see the note above. */
    age: string;
    /** `''`, `'female'` or `'male'`, lowercase, the way every record already on file spells it. */
    gender: string;
    /** Whole pounds as digits, or `''` for a patient who owed nothing. */
    balance: string;
};

/** Where the balances are dated and which branch carries them. Set once at the top of a session. */
export type Cutoff = {
    branchId: string;
    /** `YYYY-MM-DD` — the day the old system stopped being the truth. */
    date: string;
    offsetMinutes: number;
};

/** What the screen has done in this sitting. The register's own total comes from `migration.progress`. */
export type Session = {
    entered: number;
    carried: number;
    /** Piastres. */
    carriedTotal: number;
};

export const EMPTY_SESSION: Session = { entered: 0, carried: 0, carriedTotal: 0 };

const PIASTRES_PER_EGP = 100;

/** Above this and it is a mis-key, not a balance: a hundred thousand pounds owed by one patient. */
const LARGEST_BALANCE_EGP = 100_000;

export function emptyForm(): EntryForm {
    return { legacyRef: '', name: '', phone: '', age: '', gender: '', balance: '' };
}

/** Six digits is a hundred thousand pounds; the range check below refuses more. */
export function balanceDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, 6);
}

/** Digits, spaces and the leading `+` a pasted international number carries. Nothing else. */
export function phoneDigits(text: string): string {
    return text.replace(/[^\d+\s]/g, '').slice(0, 32);
}

export function balancePiastres(pounds: string): number | null {
    if (pounds.trim() === '') return null;

    const value = Number(pounds);
    if (!Number.isInteger(value) || value <= 0 || value > LARGEST_BALANCE_EGP) return null;

    return value * PIASTRES_PER_EGP;
}

// --- the cutoff date ------------------------------------------------------
//
// Typed as digits and shown with separators, the way `domain/patientDraft`'s
// date of birth is — the same keypad, the same rhythm, so the desk learns one
// date field and not two. The rule underneath is not the same one, which is why
// the parse is here rather than imported: a date of birth is refused for being
// too early and this is refused for being in the future. The old system stopped
// being the truth on a day that has already happened.
//
// `daysInMonth` is shared, because the length of February is the calendar and
// not a rule about cutoffs.

const CUTOFF_DIGITS = 8;

export function cutoffDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, CUTOFF_DIGITS);
}

/** What the field shows: the digits so far, with the separators the entry has earned. */
export function cutoffDisplay(digits: string): string {
    return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
        .filter((part) => part.length > 0)
        .join(' / ');
}

/** `YYYY-MM-DD` for the server, or null while the entry is incomplete or impossible. */
export function cutoffIso(digits: string, today: string = todayKey()): string | null {
    if (digits.length !== CUTOFF_DIGITS) return null;

    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;

    const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
    return iso > today ? null : iso;
}

export function cutoffError(digits: string, today: string = todayKey()): string | null {
    if (digits.length === 0) return null;
    if (digits.length < CUTOFF_DIGITS) return 'Day, month and year — 01 / 08 / 2026.';
    return cutoffIso(digits, today) === null ? 'The cutoff has to be a day that has happened.' : null;
}

/** Digits for a date already known, so the field opens on today rather than empty. */
export function cutoffDigitsOf(iso: string): string {
    const [year = '', month = '', day = ''] = iso.split('-');
    return `${day}${month}${year}`;
}

// --- the caret ------------------------------------------------------------
//
// The order the return key walks, and where a saved row puts the caret back.
// It lives here rather than in the screen because it is the feature — enter a
// row, get an empty form with the caret already at the top of it, no tapping —
// and `bun test` has no renderer to check it with. The screen holds the refs;
// everything about *which* field is next is decided by these three.

export const ENTRY_ORDER = ['legacyRef', 'name', 'phone', 'age', 'balance'] as const;

export type EntryFieldName = (typeof ENTRY_ORDER)[number];

/** The old ref is first because it is the number on the front of the file she is holding. */
export const FIRST_FIELD: EntryFieldName = ENTRY_ORDER[0];

/** Anything that can take the caret. `TextInput` is one; a test stub is another. */
export type Focusable = { focus: () => void };

export type EntryRefs = Partial<Record<EntryFieldName, Focusable | null>>;

/** Where the return key goes from `field`, or null at the end of the row — where it commits instead. */
export function nextField(field: EntryFieldName): EntryFieldName | null {
    return ENTRY_ORDER[ENTRY_ORDER.indexOf(field) + 1] ?? null;
}

/** A field that never mounted is not a reason to throw in the middle of a save. */
export function focusField(refs: EntryRefs, field: EntryFieldName | null): void {
    if (field === null) return;
    refs[field]?.focus();
}

export type EntryField = 'name' | 'phone' | 'age' | 'balance';

/**
 * Required and still empty. These get the treatment the editor gives an
 * unanswered required field — the label turns `due` and the button counts it —
 * and never a message. Two of them, and they are the two the old system
 * certainly has.
 */
export function blankFields(form: EntryForm): EntryField[] {
    const blank: EntryField[] = [];
    if (form.name.trim().length === 0) blank.push('name');
    if (form.phone.trim().length === 0) blank.push('phone');
    return blank;
}

/**
 * Typed, and wrong. The opposite case and so the opposite treatment: a message,
 * because there is something on screen to correct.
 */
export function malformedFields(form: EntryForm): Partial<Record<EntryField, string>> {
    const found: Partial<Record<EntryField, string>> = {};

    const phone = phoneError(form.phone);
    if (phone) found.phone = phone;

    const age = ageError(form.age);
    if (age) found.age = age;

    if (form.balance.trim() !== '' && balancePiastres(form.balance) === null) {
        found.balance = 'That is not an amount in pounds.';
    }

    return found;
}

/**
 * Everything standing between this row and the next one. `duplicate` is in here
 * rather than being a refusal of its own because it is the only one the desk
 * can overrule: two siblings genuinely do share a mother's number, and the
 * server accepts what it is sent. What it must not be is silent — over a
 * session this long the same patient does get typed twice, and the second copy
 * is only ever found later, by the balance being wrong.
 */
export type EntryBlock = EntryField | 'duplicate' | 'cutoff';

export type EntryState = {
    /** Patients already on file under this number. */
    duplicates: number;
    /** The desk has seen the warning and means it. */
    acknowledged: boolean;
    /** A balance was typed but the session has no branch or cutoff date set. */
    cutoff: Cutoff | null;
};

export function blocks(form: EntryForm, state: EntryState): EntryBlock[] {
    const found: EntryBlock[] = [
        ...blankFields(form),
        ...(Object.keys(malformedFields(form)) as EntryField[]),
    ];

    if (state.duplicates > 0 && !state.acknowledged) found.push('duplicate');

    // A balance with nowhere to hang. The server's schema refuses this too —
    // the round trip is spent finding out what the screen already knows.
    if (balancePiastres(form.balance) !== null && state.cutoff === null) found.push('cutoff');

    return found;
}

/**
 * What `migration.enter` is sent, or null while the row cannot be entered.
 *
 * `birthDate` and `gender` go as `null` rather than being left out when the
 * desk skipped them: this is always a create, so there is no stored value for
 * an absent key to preserve, and a null says plainly that the old system did
 * not have one.
 */
export type EnterInput = {
    name: string;
    phone: string;
    legacyRef: string | null;
    birthDate: string | null;
    gender: string | null;
    openingBalance?: number;
    branchId?: string;
    cutoffDate?: string;
    offsetMinutes: number;
};

export function enterInputOf(
    form: EntryForm,
    state: EntryState,
    today: Date = new Date(),
): EnterInput | null {
    if (blocks(form, state).length > 0) return null;

    const balance = balancePiastres(form.balance);
    const cutoff = state.cutoff;

    return {
        name: form.name.trim(),
        phone: form.phone.trim(),
        legacyRef: orNull(form.legacyRef),
        birthDate: birthDateOf(form.age, today),
        gender: form.gender === '' ? null : form.gender,
        offsetMinutes: cutoff?.offsetMinutes ?? 0,
        // The three travel together or not at all — the server's schema refines
        // exactly this, and a balance without a date has nothing to be dated at.
        ...(balance !== null && cutoff
            ? { openingBalance: balance, branchId: cutoff.branchId, cutoffDate: cutoff.date }
            : {}),
    };
}

/** One more row done. `carried` counts the ones that brought money with them. */
export function recorded(session: Session, balancePiastres: number | null): Session {
    return {
        entered: session.entered + 1,
        carried: session.carried + (balancePiastres === null ? 0 : 1),
        carriedTotal: session.carriedTotal + (balancePiastres ?? 0),
    };
}
