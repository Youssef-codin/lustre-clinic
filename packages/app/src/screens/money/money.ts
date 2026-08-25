// Money arithmetic, formatting and period ranges for the cluster, in a module
// with no React Native import so it is testable under `bun test`. §7.12:
// integer piastres end
// to end, formatted at the edge in `MoneyValue` only. `toEgp` rounds rather
// than truncates so a figure carrying piastres reads as the nearer pound, never
// less than is owed. Grouping is written out rather than taken from `Intl`,
// which Hermes ships in varying completeness and which would group by device
// locale where §7.11 wants one grouping in both languages. The overpayment
// clamp runs against piastres, not the rounded pound figure — a 120.50 balance
// rounds to a due of 121 pounds and taking 121 would overcharge by 50 piastres.
// The payment field accepts whole pounds only (`ui/NumericField` hardcodes
// `decimal-pad` and `ui/` is frozen): stripping a separator would read `12.50`
// as `1250`, a hundredfold overcharge. The collection rate clamps to 0–1
// because a day settling old debt can collect more than it charged.
import { addDays, offsetForDate, weekdayOf } from '../day/time';

const PIASTRES_PER_EGP = 100;

const COMPACT_FLOOR = 10_000;

export function toEgp(piastres: number): number {
    return Math.round(piastres / PIASTRES_PER_EGP);
}

function group(value: number): string {
    const digits = Math.abs(Math.trunc(value)).toString();
    let out = '';

    for (let i = 0; i < digits.length; i++) {
        if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
        out += digits[i];
    }

    return value < 0 ? `-${out}` : out;
}

function compactEgp(egp: number): string {
    if (Math.abs(egp) < COMPACT_FLOOR) return group(egp);

    const millions = Math.abs(Number((egp / 1_000_000).toFixed(1))) >= 1;
    const [divisor, suffix] = millions ? [1_000_000, 'm'] : [1_000, 'k'];
    const scaled = (egp / divisor).toFixed(1).replace(/\.0$/, '');

    return `${scaled}${suffix}`;
}

export type MoneyLocale = 'en' | 'ar';

export type FormatOptions = {
    compact?: boolean;
    locale?: MoneyLocale;
    showCurrency?: boolean;
};

export function formatEgp(piastres: number, options: FormatOptions = {}): string {
    const { compact = false, locale = 'en', showCurrency = true } = options;

    const egp = toEgp(piastres);
    const figure = compact ? compactEgp(egp) : group(egp);

    if (!showCurrency) return figure;
    return locale === 'ar' ? `${figure} ج.م` : `EGP ${figure}`;
}

export function currencyOf(locale: MoneyLocale): string {
    return locale === 'ar' ? 'ج.م' : 'EGP';
}

export function clampToBalance(enteredEgp: number, balance: number): number {
    if (!Number.isFinite(enteredEgp) || enteredEgp <= 0) return 0;
    return Math.max(0, Math.min(Math.trunc(enteredEgp) * PIASTRES_PER_EGP, balance));
}

export function isWholePounds(text: string): boolean {
    return /^[0-9]*$/.test(text);
}

export function collectionRate(charged: number, collected: number): number {
    if (charged <= 0) return 1;
    return Math.min(1, Math.max(0, collected / charged));
}

/**
 * One payment method's share of the period's takings.
 *
 * A share only exists against a positive base. A refund is a negative payment
 * row (`payments_amount_nonzero` allows it; `visit.setPaid` writes one whenever
 * a paid total is corrected downward), so a method's total can be negative and
 * the period's total can net to zero or below. None of those are a length of
 * bar: a negative share draws a bar backwards out of its track and labels it
 * "-33%", and dividing by a zero or negative total is not a percentage of
 * anything. Clamped like `collectionRate`, for the same reason.
 *
 * `hasShareBase` is the question the card has to ask *before* this: a period
 * with rows but no positive total has amounts worth showing and no split worth
 * drawing.
 */
export function methodShare(amount: number, total: number): number {
    if (!hasShareBase(total)) return 0;
    return Math.min(1, Math.max(0, amount / total));
}

export function hasShareBase(total: number): boolean {
    return total > 0;
}

export function amountStillDue(difference: number): number {
    return Math.max(0, difference);
}

export function collectedAhead(difference: number): number {
    return Math.max(0, -difference);
}

export function currencyLeads(locale: MoneyLocale): boolean {
    return locale !== 'ar';
}

export const PERIODS = ['today', 'week', 'month', 'year', 'all'] as const;

export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
    today: 'Today',
    week: 'This week',
    month: 'This month',
    year: 'This year',
    all: 'All time',
};

export type DateRange = {
    from: string;
    to: string;
    offsetMinutes: number;
    fromOffsetMinutes: number;
};

// `balance.summary` and `balance.takings` take a closed range, so "All time"
// needs a floor rather than an open start. No clinic record predates this.
const FIRST_RECORD = '2000-01-01';

/**
 * The pills, as the two range queries want them: local `YYYY-MM-DD` days plus
 * the offset the server derives the boundaries with. `to` is inclusive, so
 * every period ends today rather than at the end of the calendar unit — a
 * "This year" that ran to December would be counting a future nobody has
 * charged yet.
 *
 * `today` is passed in rather than read from the clock here. The Money tab is
 * mounted once and hidden rather than unmounted, so a screen that captured the
 * day at first render would still be asking for it days later; taking it as an
 * argument is what lets the caller re-read it, and what makes this testable
 * without faking a clock.
 *
 * The week starts Sunday: Egypt's weekend is Friday and Saturday, so Sunday is
 * the first working day, and a week that began on Saturday would open on the
 * weekend. This matches `Date#getDay` and `clinic_days.weekday`.
 *
 * Each end carries the offset in force on its own day, because Egypt keeps DST
 * and a range can start in the other regime — "This year" does, every year,
 * from the changeover in April until the one in October. One offset for both
 * ends applied a summer +03:00 to 1 January and opened the window an hour
 * before local midnight, which counted the last hour of 31 December as part of
 * the new year. The server compares a timestamp against the boundary, not a day
 * bucket, so the hour is really in or really out.
 */
export function periodRange(period: Period, today: string): DateRange {
    const from = periodStart(period, today);

    return {
        from,
        to: today,
        offsetMinutes: offsetForDate(today),
        fromOffsetMinutes: offsetForDate(from),
    };
}

function periodStart(period: Period, today: string): string {
    if (period === 'today') return today;
    if (period === 'week') return addDays(today, -weekdayOf(today));
    if (period === 'month') return `${today.slice(0, 7)}-01`;
    if (period === 'year') return `${today.slice(0, 4)}-01-01`;
    return FIRST_RECORD;
}

export const DEBTOR_SORTS = ['balance', 'oldest', 'name'] as const;

export type DebtorSort = (typeof DEBTOR_SORTS)[number];

export const DEBTOR_SORT_LABEL: Record<DebtorSort, string> = {
    balance: 'By balance',
    oldest: 'Oldest first',
    name: 'Name A–Z',
};

type SortableDebtor = { name: string; balance: number; oldestUnpaidAt: string };

// Reordering is not arithmetic on money — nothing here adds a balance up, it
// only compares two the server already derived. `oldest` compares the ISO
// stamps directly, which sort lexicographically, so the longest-owed row leads.
export function sortDebtors<T extends SortableDebtor>(rows: readonly T[], sort: DebtorSort): T[] {
    const ordered = [...rows];

    if (sort === 'oldest') return ordered.sort((a, b) => a.oldestUnpaidAt.localeCompare(b.oldestUnpaidAt));
    if (sort === 'name') return ordered.sort((a, b) => a.name.localeCompare(b.name));
    return ordered.sort((a, b) => b.balance - a.balance);
}
