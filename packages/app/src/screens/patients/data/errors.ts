// What a failed call says to the user. The client switches on `ERROR_CODE` and
// never parses or renders the server's message — those stay English, for logs.
// The English sentence is the key into the shared catalogue, so this table did
// not change when the Arabic landed and no call site did either. Offline is its
// own line: the clinic server is a PC that is off
// during a power cut, and "check the connection" is the useful instruction.
// An unrecognised code falls back to the same line as a transport failure —
// from the desk they are the same event.
import { localizeCopy } from '@lustre/shared';
import { getLocale } from '../../../i18n/runtime';
import { PatientsRequestError } from './requestError';

const TEXT: Record<string, string> = {
    NOT_FOUND: 'This patient is no longer on file.',
    VALIDATION: 'One of the answers was not accepted. Check it and try again.',
    CUSTOM_QUESTION_REQUIRED: 'A required question was left blank.',
    // Only if the clinic changed the rule on another phone while this form was
    // open: the form marks a required age or sex due before Save.
    AGE_REQUIRED:
        'This clinic needs an age on every patient. Type one, or change that in Settings → Patient fields.',
    GENDER_REQUIRED:
        'This clinic needs a sex on every patient. Choose one, or change that in Settings → Patient fields.',
    CONFLICT: 'Someone else changed this record. Reopen it and try again.',
    INTERNAL: 'The clinic server could not answer. Try again in a moment.',
    // The payment codes. `PAYMENT_EXCEEDS_BALANCE` is deliberately vague about
    // the figure here — the sheet says it with the real total in it, which this
    // function has no way to know. It only ever shows if the two disagree, which
    // means the balance moved on the other phone between opening and submitting.
    PAYMENT_EXCEEDS_BALANCE: 'That is more than this patient owes. Reopen the record and try again.',
    NOTHING_OUTSTANDING: 'This patient owes nothing.',
    HAS_PAYMENTS:
        'This patient has payments on file, so the record stays. Remove the payments from their visits first if they were entered by mistake.',
    PAYMENT_NOTE_REQUIRED: 'Say what the payment was.',
    INVALID_AMOUNT: 'That amount is not valid.',
    // The three an old-patient registration can come back with. Each names the
    // field or the setting to go and fix, because each is something the desk
    // can actually do something about.
    PATIENT_REF_TAKEN: 'Another patient already has that number. Check the old ref and try again.',
    PATIENT_REF_RESERVED:
        'That number has not been given out yet. Check the old ref, or raise the next patient number in Settings → Clinic.',
    // The two a ref correction can come back with. Format is caught before the
    // call, so this only shows if the two disagree; the role is the server's
    // word and the phone cannot know it in advance.
    PATIENT_REF_INVALID:
        'That is not a patient number. Use 910, or the four-character code on an older file.',
    REF_EDIT_FORBIDDEN:
        'Only the doctor can change a patient number. Switch roles in Settings to make this change.',
    MIGRATION_NOT_CONFIGURED:
        'The clinic server needs updating before it can take what an old patient owes. Register them without it for now.',
    IMPORTED_DATE_AFTER_CUTOFF:
        'One of the old procedures is dated after the cutoff. Work done since then belongs in a visit, not here.',
    INVALID_PHONE: 'That phone number was not accepted. Check it and try again.',
    TOOTH_REQUIRED: 'One of the old procedures is done to a tooth and has none. Remove it and add it again.',
    TOOTH_NOT_APPLICABLE: 'One of the old procedures is not done to a tooth. Remove it and add it again.',
    PROCEDURE_DUPLICATE: 'The same procedure is listed twice on one day. Remove one of them.',
    DB_UNAVAILABLE: 'The clinic server could not answer. Try again in a moment.',
};

const OFFLINE = 'Could not reach the clinic server. Check the connection and try again.';

export function errorText(error: unknown): string {
    const locale = getLocale();
    if (!(error instanceof PatientsRequestError)) return localizeCopy(locale, OFFLINE);
    if (error.offline) return localizeCopy(locale, OFFLINE);
    return localizeCopy(locale, TEXT[error.code] ?? OFFLINE);
}
