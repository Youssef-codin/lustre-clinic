// Dates and error copy for the money cluster. Money itself is not formatted
// here — `_LocalMoneyValue` is the only place (§7.12). `visa` is labelled
// "Card" because that is what the desk calls it; the stored value is untouched.
// The client switches on `ERROR_CODE` and never parses the server's message,
// and this one map is where a localisation scaffold will land.
import { ERROR_CODE, type ErrorCode, type PaymentMethod } from '@lustre/shared';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

const MONTHS_LONG = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function dayStamp(iso: string): { day: string; month: string } {
    const date = new Date(iso);
    return {
        day: String(date.getDate()).padStart(2, '0'),
        month: MONTHS[date.getMonth()] ?? '',
    };
}

export function longDate(iso: string): string {
    const date = new Date(iso);
    return `${date.getDate()} ${MONTHS_LONG[date.getMonth()] ?? ''} ${date.getFullYear()}`;
}

export function longDateTime(iso: string): string {
    const date = new Date(iso);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${longDate(iso)}, ${hours}:${minutes}`;
}

export function outstandingAge(iso: string, now: Date = new Date()): string {
    const days = Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);

    if (days <= 0) return 'today';
    if (days === 1) return '1 day';
    if (days < 31) return `${days} days`;

    const months = Math.floor(days / 30);
    if (months < 12) return months === 1 ? '1 month' : `${months} months`;

    const years = Math.floor(days / 365);
    return years === 1 ? '1 year' : `${years} years`;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
    cash: 'Cash',
    visa: 'Card',
    instapay: 'Instapay',
    other: 'Other',
};

export function methodLabel(method: PaymentMethod, note?: string | null): string {
    if (method === 'other' && note?.trim()) return note.trim();
    return METHOD_LABEL[method];
}

const ERROR_MESSAGE: Partial<Record<ErrorCode, string>> = {
    [ERROR_CODE.DB_UNAVAILABLE]: "Can't reach the clinic server.",
    [ERROR_CODE.NOT_FOUND]: 'That visit no longer exists.',
    [ERROR_CODE.INVALID_AMOUNT]: 'That amount is not valid.',
    [ERROR_CODE.PAYMENT_NOTE_REQUIRED]: 'Say what the payment was.',
    [ERROR_CODE.VALIDATION]: 'That payment was rejected.',
};

export function errorMessage(code: ErrorCode): string {
    return ERROR_MESSAGE[code] ?? 'Something went wrong.';
}
