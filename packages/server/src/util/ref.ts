/**
 * SPEC §5 — `appointments.ref` is `DDMMYY-XXXX`, day first, unique within the
 * date. `patients.ref` is a plain number off `settings.patient_ref_last`,
 * allocated where the patient is inserted.
 *
 * The alphabet excludes `0/O` and `1/I/L` so a ref read down the phone or
 * written by hand is unambiguous. Stored uppercase, matched case-insensitively.
 *
 * Modulo bias across the alphabet's symbols is irrelevant: uniqueness is
 * enforced by the UNIQUE constraint, not by the distribution.
 */
import { PATIENT_REF_PATTERN, REF_ALPHABET, REF_PATTERN, REF_RANDOM_LENGTH } from '@lustre/shared';
import { refDatePart } from './time.ts';

function randomRefSuffix(): string {
    const bytes = new Uint8Array(REF_RANDOM_LENGTH);
    crypto.getRandomValues(bytes);

    let out = '';
    for (const byte of bytes) {
        out += REF_ALPHABET[byte % REF_ALPHABET.length];
    }
    return out;
}

export function buildRef(startsAt: Date, offsetMinutes = 0): string {
    return `${refDatePart(startsAt, offsetMinutes)}-${randomRefSuffix()}`;
}

/**
 * The highest patient ref that is a plain number, or 0. Patients from before
 * numbering keep random codes, which are skipped — except the few that happen
 * to be all digits, like `2345`, which the counter must not hand out again.
 */
export function highestNumericRef(refs: Iterable<string>): number {
    let highest = 0;
    for (const ref of refs) {
        if (/^\d+$/.test(ref)) highest = Math.max(highest, Number(ref));
    }
    return highest;
}

/**
 * The stored form of a ref typed by hand. Refs are stored uppercase and matched
 * case-insensitively (see the header), so a corrected ref typed as `w5f5` has
 * to become the `W5F5` the constraint and every lookup expect.
 */
export function normalizeRef(raw: string): string {
    return raw.trim().toUpperCase();
}

/**
 * Whether a string is a ref this app would have issued to a patient.
 *
 * Two shapes are valid, and both have to stay valid. A patient numbered since
 * the counter landed has a plain number off it. A patient from *before*
 * numbering has the four-character random code they were given, which is still
 * the number written on their paper file — refusing that shape here would make
 * every one of those records uneditable, and would refuse putting one back if
 * it were mistyped. Neither can be read as an appointment ref: that one carries
 * a date and a hyphen.
 */
export function isPatientRef(ref: string): boolean {
    return PATIENT_REF_PATTERN.test(ref);
}

/** Whether a string is `DDMMYY-XXXX`. Not whether that date is the appointment's. */
export function isAppointmentRef(ref: string): boolean {
    return REF_PATTERN.test(ref);
}
