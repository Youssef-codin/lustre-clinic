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
import { REF_ALPHABET, REF_RANDOM_LENGTH } from '@lustre/shared';
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
