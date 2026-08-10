/**
 * Turning piastres into money, kept apart from the component that renders it so
 * it can be tested without a renderer (`patients.test.ts`).
 *
 * §7.12 — money is integer piastres end to end (SPEC §9) and is formatted at
 * the edge, in one place. Whole EGP in the UI; piastres are never shown, so a
 * balance of 260050 reads `EGP 2,601` rather than exposing a half-pound nobody
 * can pay. No screen formats money itself.
 *
 * §7.13 — `EGP 2,600` in English, `2,600 ج.م` in Arabic: the symbol trails. And
 * §7.11 keeps the numerals Latin in both, because DM Mono has no Arabic-Indic
 * coverage and a localised digit would break the tabular alignment the amounts
 * are set in.
 */

export type MoneyLocale = 'en' | 'ar';

const SYMBOL: Record<MoneyLocale, string> = { en: 'EGP', ar: 'ج.م' };

/**
 * Whole pounds, grouped in threes. Written out rather than left to `Intl`:
 * Hermes ships a cut-down ICU, and the grouping is three characters of regex
 * against a runtime difference that only shows up on a device.
 */
export function formatMoney(amount: number, locale: MoneyLocale = 'en'): string {
    // Rounded on the magnitude, not the signed value: `Math.round` breaks ties
    // toward +∞, so -250 would round to -2 while 250 rounds to 3, and anything
    // in (-100, 0) would land on -0 and lose its sign. No screen renders a
    // negative amount today, but this is the formatter §7.12 wants promoted to
    // `domain/`, where an overpayment or a refund eventually arrives.
    const magnitude = Math.round(Math.abs(amount) / 100);
    const grouped = magnitude.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const signed = amount < 0 && magnitude > 0 ? `-${grouped}` : grouped;
    return locale === 'ar' ? `${signed} ${SYMBOL.ar}` : `${SYMBOL.en} ${signed}`;
}
