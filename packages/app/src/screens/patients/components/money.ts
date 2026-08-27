// Turning piastres into money, kept apart from the component so it can be
// tested without a renderer. §7.12: integer piastres end to end, formatted at
// the edge in one place — piastres are never shown, so 260050 reads `EGP 2,601`.
// §7.13: the symbol trails in Arabic; §7.11: numerals stay Latin in both (DM
// Mono has no Arabic-Indic coverage). Grouping is written out rather than left
// to `Intl`, which Hermes ships cut-down. Rounding is applied to the magnitude,
// not the signed value: `Math.round` breaks ties toward +∞, so a negative
// amount would otherwise lose its sign or land on -0.
export type MoneyLocale = 'en' | 'ar';

const SYMBOL: Record<MoneyLocale, string> = { en: 'EGP', ar: 'ج.م' };

export function formatMoney(amount: number, locale: MoneyLocale = 'en'): string {
    const signed = formatAmount(amount);
    return locale === 'ar' ? `${signed} ${SYMBOL.ar}` : `${SYMBOL.en} ${signed}`;
}

/**
 * The number with no symbol, for a column that has already said what it holds.
 * The history's amounts run down one edge under a heading about money, and
 * `EGP` repeated on every row is thirty pixels of the same three letters.
 */
export function formatAmount(amount: number): string {
    const magnitude = Math.round(Math.abs(amount) / 100);
    const grouped = magnitude.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return amount < 0 && magnitude > 0 ? `-${grouped}` : grouped;
}

const PIASTRES_PER_POUND = 100;

/** What the amount reads as on screen, in whole pounds. */
export function toPounds(piastres: number): number {
    return Math.round(piastres / PIASTRES_PER_POUND);
}

/**
 * The payment field takes digits and nothing else. `ui/NumericField` is asked
 * for `number-pad` so there is no decimal key to press, and this refuses a
 * paste: `12.50` read as `1250` is a hundredfold overcharge, and the money is
 * integer piastres end to end (§7.12) with piastres never entered.
 */
export function isWholePounds(text: string): boolean {
    return /^[0-9]*$/.test(text);
}

/**
 * Pounds typed into the field, as the piastres to send.
 *
 * The ceiling is not a courtesy any more. `balance.settle` **refuses** anything
 * over what the patient owes, and `toPounds` rounds to the nearer pound: an
 * outstanding of 120.50 shows a due of 121, and submitting 12,100 piastres
 * against a 12,050 balance would come back refused for a figure the screen
 * itself displayed. Clamping to the real balance is what keeps the entry and
 * the server agreeing about the last fifty piastres.
 */
export function clampToOutstanding(enteredPounds: number, outstanding: number): number {
    if (!Number.isFinite(enteredPounds) || enteredPounds <= 0) return 0;
    return Math.max(0, Math.min(Math.trunc(enteredPounds) * PIASTRES_PER_POUND, outstanding));
}

const METHOD_LABEL: Record<string, string> = {
    cash: 'Cash',
    // What the desk calls it. The stored value is untouched.
    visa: 'Card',
    instapay: 'Instapay',
    other: 'Other',
};

export function methodLabel(method: string): string {
    return METHOD_LABEL[method] ?? 'Other';
}

/**
 * What the payment did, in the terms the desk posts it in: `EGP 6,000 recorded
 * — EGP 3,550 still owed`.
 *
 * The clinic's paper book is one page per patient, so the desk writes one line
 * against one page: what came in, and what is left. That is the whole sentence.
 *
 * It named the individual visits until the paper was understood — *"settled
 * 060826-5NCC, part-paid 120826-57UQ"* — on the assumption that the file was per
 * visit and the ref matched the two. It is not, so those refs pointed at pages
 * that do not exist. The server still returns the per-visit split and should
 * keep doing so; it is bookkeeping, not something anyone copies out.
 *
 * Paying a balance off in full is worth saying outright rather than as `EGP 0
 * still owed` — the desk marks the page closed, which is a different pen stroke.
 */
export function paymentReceipt(report: { amount: number; outstandingAfter: number }): string {
    const taken = `${formatMoney(report.amount)} recorded`;

    return report.outstandingAfter <= 0
        ? `${taken} — paid in full`
        : `${taken} — ${formatMoney(report.outstandingAfter)} still owed`;
}
