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
    const pounds = Math.round(amount / 100);
    const grouped = Math.abs(pounds)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const signed = pounds < 0 ? `-${grouped}` : grouped;
    return locale === 'ar' ? `${signed} ${SYMBOL.ar}` : `${SYMBOL.en} ${signed}`;
}
