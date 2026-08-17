// Money arithmetic and formatting for the cluster, in a module with no React
// Native import so it is testable under `bun test`. §7.12: integer piastres end
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

export function amountStillDue(difference: number): number {
    return Math.max(0, difference);
}

export function collectedAhead(difference: number): number {
    return Math.max(0, -difference);
}

export function currencyLeads(locale: MoneyLocale): boolean {
    return locale !== 'ar';
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
