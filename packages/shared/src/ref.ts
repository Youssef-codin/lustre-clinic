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

/**
 * The highest patient ref that is a plain number, or 0. The random codes from
 * before numbering are skipped — except the few that happen to be all digits,
 * like `2345`, which the counter must not hand out a second time.
 */
export function highestNumericRef(refs: Iterable<string>): number {
    let highest = 0;
    for (const ref of refs) {
        if (/^\d+$/.test(ref)) highest = Math.max(highest, Number(ref));
    }
    return highest;
}

/** `DDMMYY-XXXX`, dated in the clinic's local day. */
export function buildRef(startsAt: Date, draw: Draw, offsetMinutes = 0): string {
    return `${refDatePart(startsAt, offsetMinutes)}-${randomRefSuffix(draw)}`;
}
