// Dates and error copy for the money cluster. Money itself is not formatted
// here — `MoneyValue` is the only place (§7.12). `visa` is labelled
// "Card" because that is what the desk calls it; the stored value is untouched.
// The client switches on `ERROR_CODE` and never parses the server's message,
// and this one map is where a localisation scaffold will land.
import { ERROR_CODE, type ErrorCode, PAYMENT_METHODS, type PaymentMethod } from '@lustre/shared';

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

// The stats heading names the month the figures are being read in, not the
// period the pills select — "Stats · June 2026" stays put while the pills move.
export function statsPeriodLabel(now: Date = new Date()): string {
    return `Stats · ${MONTHS_LONG[now.getMonth()] ?? ''} ${now.getFullYear()}`;
}

// "This month" → "Total collected this month" / "Due this month". The period
// labels are written to read as the tail of both sentences, so neither needs a
// map of its own.
export function takingsLabel(periodLabel: string): string {
    return `Total collected ${periodLabel.toLowerCase()}`;
}

export function dueLabel(periodLabel: string): string {
    return `Due ${periodLabel.toLowerCase()}`;
}

/**
 * `visit.byId` types a payment's method as `string`, not the enum — the column
 * is a real Postgres enum and the widening is in `visit.service.ts`'s own
 * `VisitPayment`. Narrowing here keeps it out of every call site; a value that
 * is not a method at all can only mean the enum has grown, and labelling it
 * "Other" is a better answer than a blank row.
 */
export function paymentMethodOf(method: string): PaymentMethod {
    return (PAYMENT_METHODS as readonly string[]).includes(method) ? (method as PaymentMethod) : 'other';
}

export function methodLabel(method: string): string {
    return METHOD_LABEL[paymentMethodOf(method)];
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
