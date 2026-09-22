/**
 * SPEC §5 — `patients.phone` is E.164, normalized on write. §11 builds the
 * WhatsApp deep link from it (`wa.me/<E164 without +>`), which is why the
 * stored form has to be right at write time rather than at display time.
 *
 * The clinic is Egyptian, so a bare local number is assumed Egyptian: `01…`
 * becomes `+201…`. Anything already carrying a country code is kept as it is.
 * This is deliberately not a full libphonenumber — it validates shape, not
 * whether an operator has issued the number.
 *
 * A patient has one number and it is validated, but it is not theirs alone: a
 * parent registers three children on their own phone, so the same normalized
 * number sits on several records and every reader that answers "who is on this
 * number" answers with a list. Search is the one place that needed more than
 * the stored form — see `phoneSearchTerm`.
 */
import { ERROR_CODE } from '@lustre/shared';
import { AppError } from '../errors/AppError.ts';

const DEFAULT_COUNTRY_CODE = '20';

export function normalizePhone(raw: string): string {
    const trimmed = raw.trim();
    const cleaned = trimmed.replace(/[\s\-().]/g, '');

    let digits: string;

    if (cleaned.startsWith('+')) {
        digits = cleaned.slice(1);
    } else if (cleaned.startsWith('00')) {
        digits = cleaned.slice(2);
    } else if (cleaned.startsWith('0')) {
        digits = DEFAULT_COUNTRY_CODE + cleaned.slice(1);
    } else {
        digits = cleaned;
    }

    if (!/^\d{8,15}$/.test(digits)) {
        throw new AppError(ERROR_CODE.INVALID_PHONE, 'phone is not a valid E.164 number', 422);
    }

    return `+${digits}`;
}

/**
 * What to match a *search* term against the stored `phone` with, or null when
 * the term holds no number at all.
 *
 * A whole number normalizes and is matched in the form it is stored in. A
 * half-typed one does not — `normalizePhone` owes a finished number its length
 * check — and matching it as typed would find nothing at all: `0101234` shares
 * no substring with the stored `+201012345678`, because the local `0` became
 * `20` on write. So a partial number is given the country-code treatment
 * without the length check, and matched as a substring of the digits.
 *
 * The leading `+` is dropped for the partial case on purpose: `20101` has to
 * match the middle of a stored number as readily as its start.
 */
export function phoneSearchTerm(raw: string): string | null {
    try {
        return normalizePhone(raw);
    } catch {}

    const cleaned = raw.trim().replace(/[\s\-().]/g, '');

    let digits: string;
    if (cleaned.startsWith('+')) digits = cleaned.slice(1);
    else if (cleaned.startsWith('00')) digits = cleaned.slice(2);
    else if (cleaned.startsWith('0')) digits = DEFAULT_COUNTRY_CODE + cleaned.slice(1);
    else digits = cleaned;

    return /^\d+$/.test(digits) ? digits : null;
}

export function toWhatsAppNumber(e164: string): string {
    return e164.replace(/^\+/, '');
}
