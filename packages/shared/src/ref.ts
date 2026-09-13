/**
 * SPEC §5 — how a ref is put together. The randomness is the caller's: the
 * server draws from `crypto`, and Hermes, where the demo backend runs, has no
 * `crypto` to draw from.
 */
import { REF_ALPHABET, REF_RANDOM_LENGTH } from './constants.ts';
import { refDatePart } from './time.ts';

/** An index in `[0, size)`. */
export type Draw = (size: number) => number;

export function randomRefSuffix(draw: Draw): string {
    let out = '';
    for (let i = 0; i < REF_RANDOM_LENGTH; i += 1) {
        out += REF_ALPHABET[draw(REF_ALPHABET.length)];
    }
    return out;
}

/** `DDMMYY-XXXX`, dated in the clinic's local day. */
export function buildRef(startsAt: Date, draw: Draw, offsetMinutes = 0): string {
    return `${refDatePart(startsAt, offsetMinutes)}-${randomRefSuffix(draw)}`;
}
