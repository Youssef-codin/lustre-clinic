/**
 * SPEC §5 — `patients.phone` is E.164, normalized on write. §11 builds the
 * WhatsApp deep link from it (`wa.me/<E164 without +>`), which is why the
 * stored form has to be right at write time rather than at display time.
 *
 * The clinic is Egyptian, so a bare local number is assumed Egyptian: `01…`
 * becomes `+201…`. Anything already carrying a country code is kept as it is.
 * This is deliberately not a full libphonenumber — it validates shape, not
 * whether an operator has issued the number.
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

export function toWhatsAppNumber(e164: string): string {
    return e164.replace(/^\+/, '');
}
