import { REF_ALPHABET, REF_RANDOM_LENGTH } from '@mawid/shared';
import { refDatePart } from './time.ts';

/**
 * SPEC §5 — `ref` is `DDMMYY-XXXX`, day first, unique within the date. The
 * alphabet excludes `0/O` and `1/I/L` so a ref read down the phone is
 * unambiguous. Stored uppercase, matched case-insensitively.
 */

export function randomRefSuffix(): string {
    const bytes = new Uint8Array(REF_RANDOM_LENGTH);
    crypto.getRandomValues(bytes);

    let out = '';
    for (const byte of bytes) {
        // Modulo bias across 31 symbols is irrelevant here: uniqueness is
        // enforced by the UNIQUE constraint, not by the distribution.
        out += REF_ALPHABET[byte % REF_ALPHABET.length];
    }
    return out;
}

export function buildRef(startsAt: Date, offsetMinutes = 0): string {
    return `${refDatePart(startsAt, offsetMinutes)}-${randomRefSuffix()}`;
}
