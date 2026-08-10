// The money arithmetic and formatting for the cluster, kept in a module with no
// React Native import so it can be tested under `bun test` — there is no
// renderer in this project's test setup (ui/README.md), and these are the
// functions where being wrong costs the most.
//
// §7.12: integer piastres end to end, format at the edge, and no screen formats
// money itself. Everything below is consumed through `MoneyValue`.

/** §5, §9 — money is integer piastres everywhere in storage and transport. */
const PIASTRES_PER_EGP = 100;

/**
 * Below this, compact would be noise: `9,400` is not improved by `9.4k`, and the
 * designs only ever draw the compact form on figures in the tens of thousands
 * and up (`142.6k`).
 */
const COMPACT_FLOOR = 10_000;

/**
 * §7.12 — piastres are never shown. Prices are entered in whole pounds, so the
 * hundreds digit is always zero and this rounds nothing in practice; it rounds
 * rather than truncates so that a figure which somehow carries piastres reads as
 * the nearer pound instead of silently reporting less than is owed.
 */
export function toEgp(piastres: number): number {
    return Math.round(piastres / PIASTRES_PER_EGP);
}

/** Thousands separators. Written out rather than taken from `Intl`, which
 * Hermes ships in varying completeness and which would group by device locale
 * where §7.11 wants one grouping in both languages. */
function group(value: number): string {
    const digits = Math.abs(Math.trunc(value)).toString();
    let out = '';

    for (let i = 0; i < digits.length; i++) {
        if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
        out += digits[i];
    }

    return value < 0 ? `-${out}` : out;
}

/** `142.6k`, `1.2m`. One decimal, and a trailing `.0` is dropped. */
function compactEgp(egp: number): string {
    if (Math.abs(egp) < COMPACT_FLOOR) return group(egp);

    // Rounded before the unit is chosen, so 999,950 reads `1m` and not `1000k`.
    const millions = Math.abs(Number((egp / 1_000_000).toFixed(1))) >= 1;
    const [divisor, suffix] = millions ? [1_000_000, 'm'] : [1_000, 'k'];
    const scaled = (egp / divisor).toFixed(1).replace(/\.0$/, '');

    return `${scaled}${suffix}`;
}

export type MoneyLocale = 'en' | 'ar';

export type FormatOptions = {
    /** §7.12 — the money hero and the stat cards only. Full amounts elsewhere. */
    compact?: boolean;
    locale?: MoneyLocale;
    /** Off where a column header or a neighbouring figure already carries EGP. */
    showCurrency?: boolean;
};

/**
 * §7.13 — `EGP 2,600` in English, `2,600 ج.م` in Arabic: the symbol trails, per
 * the copy in `settings-procedures`. The numerals stay Latin in both, per §7.11:
 * DM Mono has no Arabic-Indic coverage, and swapping the face for the digits
 * would break the tabular alignment every amount column depends on.
 */
export function formatEgp(piastres: number, options: FormatOptions = {}): string {
    const { compact = false, locale = 'en', showCurrency = true } = options;

    const egp = toEgp(piastres);
    const figure = compact ? compactEgp(egp) : group(egp);

    if (!showCurrency) return figure;
    return locale === 'ar' ? `${figure} ج.م` : `EGP ${figure}`;
}

/** Just the currency, unformatted — `EGP` or `ج.م`. */
export function currencyOf(locale: MoneyLocale): string {
    return locale === 'ar' ? 'ج.م' : 'EGP';
}

/**
 * §7.6 — OVERPAYMENT DOES NOT EXIST. What may be recorded against a balance,
 * given whole pounds typed into a field and the balance the server derived.
 *
 * The clamp is against the balance in piastres, not against the rounded pound
 * figure: a balance of 120.50 rounds to a due of 121 whole pounds, and taking
 * 121 pounds would be 50 piastres more than is owed. The lower of the two is
 * what is owed, and a payment is never negative.
 */
export function clampToBalance(enteredEgp: number, balance: number): number {
    if (!Number.isFinite(enteredEgp) || enteredEgp <= 0) return 0;
    return Math.max(0, Math.min(Math.trunc(enteredEgp) * PIASTRES_PER_EGP, balance));
}

/**
 * Whether a payment field's contents are whole pounds — ASCII digits and
 * nothing else.
 *
 * `ui/NumericField` hardcodes `keyboardType="decimal-pad"` and `ui/` is frozen,
 * so a decimal separator can be typed into a field that takes whole pounds only
 * (§7.12 — piastres are never shown and never typed). Stripping the separator
 * out would read `12.50` as `1250`: a hundredfold overcharge that then passes
 * every clamp, because 1,250 is a perfectly plausible payment. Callers refuse
 * the keystroke instead, and say so.
 */
export function isWholePounds(text: string): boolean {
    return /^[0-9]*$/.test(text);
}
